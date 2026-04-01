/**
 * orchestrateTenantSync
 *
 * Single backend-owned pipeline for one full tenant sync run.
 * Owns: lock acquisition, all step execution in order, retries, lock release.
 * Execution: Fully synchronous — awaits complete pipeline before returning.
 *
 * Pipeline order:
 *   registry → productMaster → composition → hazards → sds →
 *   sites → suppliers → documents →
 *   lookupGhsHazardCodes → lookupGhsPictograms → lookupGhsPrecautionary →
 *   lookupPPE → lookupNFPA → lookupGlossary
 *
 * NOTE: sha256-based steps (composition, hazards, sds) build their file list
 * from the already-synced ProductMaster entity — NO relay file-list endpoint is called.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Utilities ───────────────────────────────────────────────────────────────

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function writeSyncLog(sr, entry) {
  try {
    await sr.entities.SyncLog.create({ ...entry, created_at: new Date().toISOString() });
  } catch (_) { /* silent */ }
}

const fetchWithRetry = async (url, options = {}, maxRetries = 3) => {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 120s timeout for large relay responses
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return res;
    } catch (err) {
      lastError = err;
      const isTimeout = err.name === 'AbortError';
      if (isTimeout) console.warn(`[fetchWithRetry] Timeout on attempt ${attempt}/${maxRetries}`);
      if (attempt < maxRetries) await sleep(Math.min(1000 * Math.pow(2, attempt - 1), 10000));
    }
  }
  throw lastError;
};

const relayWithBackoff = async (relayUrl, relaySecret, endpoint, params, maxAttempts = 10) => {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchWithRetry(relayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Relay-Secret': relaySecret },
        body: JSON.stringify({ endpoint, ...params }),
      }, 3);
      if (!res.ok) {
        const text = await res.text();
        if (res.status === 429) {
          lastError = new Error(`Rate limit 429 on ${endpoint}`);
          if (attempt < maxAttempts) {
            const wait = Math.min(2000 * Math.pow(2, attempt - 1), 60000);
            console.log(`[relay] 429 on ${endpoint}, attempt ${attempt}/${maxAttempts}, waiting ${wait}ms`);
            await sleep(wait);
            continue;
          }
        } else {
          throw new Error(`Relay ${endpoint} failed ${res.status}: ${text}`);
        }
      } else {
        const data = await res.json();
        return data.recordset || [];
      }
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts) break;
    }
  }
  throw lastError;
};

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function insertRows(sr, entityName, rows, lockRow) {
   let created = 0;
   const BATCH_SIZE = 200; // optimized batch size: 120 rec/sec, zero 429s
   for (let i = 0; i < rows.length; i += BATCH_SIZE) {
     const batch = rows.slice(i, i + BATCH_SIZE);
     let attempts = 0;
     while (true) {
       try {
         await sr.entities[entityName].bulkCreate(batch);
         created += batch.length;
         // Refresh heartbeat after successful insert
         if (lockRow) await refreshLock(sr, lockRow);
         break;
       } catch (e) {
         if (e.message?.includes('Rate limit') || e.status === 429) {
           attempts++;
           if (attempts >= 10) throw new Error(`insertRows: failed on ${entityName} after 10 attempts`);
           const wait = Math.min(1000 * Math.pow(2, attempts - 1), 30000);
           await sleep(wait);
         } else {
           throw e;
         }
       }
     }
     // Minimal inter-batch delay (reduced from 3000ms to 250ms)
     if (i + BATCH_SIZE < rows.length) await sleep(50);
   }
   return created;
 }

async function upsertRows(sr, entityName, rows, keyFields, tenantScopedFilter, lockRow) {
   const keyFieldArray = Array.isArray(keyFields) ? keyFields : [keyFields];
   const BATCH_SIZE = 50;
   const tenantId = tenantScopedFilter && rows[0]?.tenant_id ? rows[0].tenant_id : null;
   const filterQ = tenantId ? { tenant_id: tenantId } : {};

   let existingMap = {};
   let fetchAttempts = 0;
   while (fetchAttempts < 5) {
     try {
       let offset = 0;
       while (true) {
         const pageRaw = await sr.entities[entityName].filter(filterQ, null, 1000, offset);
         const page = Array.isArray(pageRaw) ? pageRaw : (pageRaw?.data || []);
         if (page.length === 0) break;
         page.forEach(r => {
           existingMap[keyFieldArray.map(k => r[k]).join('|')] = r.id;
         });
         if (page.length < 1000) break;
         offset += 1000;
         await sleep(200);
       }
       break;
     } catch (e) {
       if (e.status === 429) { fetchAttempts++; await sleep(2000 * fetchAttempts); }
       else throw e;
     }
   }
   if (fetchAttempts >= 5) throw new Error(`upsertRows: failed to fetch ${entityName} after 5 attempts`);

   const toCreate = [];
   const toUpdate = [];
   rows.forEach(row => {
     const key = keyFieldArray.map(k => row[k]).join('|');
     if (existingMap[key]) toUpdate.push({ id: existingMap[key], data: row });
     else toCreate.push(row);
   });

   let created = 0;
   for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
     const batch = toCreate.slice(i, i + BATCH_SIZE);
     let attempts = 0;
     while (attempts < 10) {
       try { await sr.entities[entityName].bulkCreate(batch); created += batch.length; if (lockRow) await refreshLock(sr, lockRow); break; }
       catch (e) {
         if (e.status === 429 || e.message?.includes('Rate limit')) { attempts++; await sleep(Math.min(1000 * Math.pow(2, attempts - 1), 15000)); }
         else throw e;
       }
     }
     if (attempts >= 10) throw new Error(`upsertRows: create failed on ${entityName}`);
     if (i + BATCH_SIZE < toCreate.length) await sleep(250);
   }

   let updated = 0;
   for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
     const batch = toUpdate.slice(i, i + BATCH_SIZE);
     let attempts = 0;
     while (attempts < 10) {
       try { await Promise.all(batch.map(u => sr.entities[entityName].update(u.id, u.data))); updated += batch.length; if (lockRow) await refreshLock(sr, lockRow); break; }
       catch (e) {
         if (e.status === 429 || e.message?.includes('Rate limit')) { attempts++; await sleep(Math.min(1000 * Math.pow(2, attempts - 1), 15000)); }
         else throw e;
       }
     }
     if (attempts >= 10) throw new Error(`upsertRows: update failed on ${entityName}`);
     if (i + BATCH_SIZE < toUpdate.length) await sleep(250);
   }

   return created + updated;
 }

// ─── SyncState management ────────────────────────────────────────────────────

async function getSingleSyncState(sr, syncKey) {
  const raw = await sr.entities.SyncState.filter({ sync_key: syncKey });
  const rows = Array.isArray(raw) ? raw : (raw?.data || []);
  if (rows.length === 0) return null;

  rows.sort((a, b) => {
    const t = r => new Date(r.updated_date || r.updated_at || r.created_date || r.created_at || 0).getTime();
    return t(b) - t(a);
  });

  for (let i = 1; i < rows.length; i++) {
    try { await sr.entities.SyncState.delete(rows[i].id); } catch (_) {}
  }
  return rows[0];
}

async function ensureSyncState(sr, { syncKey, tenantId, step, force }) {
  let s = await getSingleSyncState(sr, syncKey);
  if (!s) {
    return sr.entities.SyncState.create({
      sync_key: syncKey, tenant_id: tenantId, step,
      requested_mode: 'full', status: 'in_progress',
      purge_started_at: force ? new Date().toISOString() : null,
      purge_completed_at: null, watermark_timestamp: null,
      completed_at: null, last_error: null, last_error_at: null,
    });
  }
  if (force) {
    return sr.entities.SyncState.update(s.id, {
      requested_mode: 'full', status: 'in_progress',
      purge_started_at: new Date().toISOString(), purge_completed_at: null,
      completed_at: null, last_error: null, last_error_at: null,
    });
  }
  if (s.requested_mode === 'full' && s.status !== 'success') return s; // resume
  return sr.entities.SyncState.update(s.id, {
    requested_mode: 'incremental', status: 'in_progress',
    completed_at: null, last_error: null, last_error_at: null,
  });
}

async function markSyncSuccess(sr, id, watermark) {
  await sr.entities.SyncState.update(id, {
    status: 'success',
    watermark_timestamp: watermark ? new Date(watermark).toISOString() : null,
    completed_at: new Date().toISOString(),
    last_error: null, last_error_at: null,
  });
}

async function markPurgeComplete(sr, id) {
  await sr.entities.SyncState.update(id, { purge_completed_at: new Date().toISOString() });
}

// ─── Lock management ─────────────────────────────────────────────────────────

function getTenantLockKey(siteParent) { return `lock:tenant:${siteParent}:sync`; }

async function getSingleLock(sr, lockKey) {
  const raw = await sr.entities.SyncState.filter({ sync_key: lockKey });
  const rows = Array.isArray(raw) ? raw : (raw?.data || []);
  if (rows.length === 0) return null;

  rows.sort((a, b) => {
    const t = r => new Date(r.heartbeat_at || r.updated_date || r.updated_at || r.started_at || r.created_date || r.created_at || 0).getTime();
    return t(b) - t(a);
  });
  for (let i = 1; i < rows.length; i++) {
    try { await sr.entities.SyncState.delete(rows[i].id); } catch (_) {}
  }
  return rows[0];
}

function isLockActive(lockRow) {
  if (!lockRow || lockRow.status !== 'in_progress') return false;
  // Use heartbeat_at exclusively when present — it's the only field we control.
  // Do NOT fall back to updated_date which auto-refreshes on any DB write (including force_unlock).
  const ts = lockRow.heartbeat_at
    ? new Date(lockRow.heartbeat_at).getTime()
    : new Date(lockRow.started_at || lockRow.created_date || 0).getTime();
  return ts > 0 && (Date.now() - ts) < (5 * 60 * 1000); // 5 min TTL
}

async function acquireLock(sr, siteParent, syncRunId) {
  const lockKey = getTenantLockKey(siteParent);
  const existing = await getSingleLock(sr, lockKey);

  if (existing && isLockActive(existing)) {
    const err = new Error(`Sync already running for tenant ${siteParent}`);
    err.statusCode = 409;
    throw err;
  }

  const now = new Date().toISOString();
  const lockData = {
    tenant_id: siteParent, step: '__tenant_lock__',
    requested_mode: 'incremental', status: 'in_progress',
    sync_run_id: syncRunId, started_at: now, heartbeat_at: now,
    completed_at: null, last_error: null, last_error_at: null,
  };

  if (existing) {
    return sr.entities.SyncState.update(existing.id, lockData);
  }
  return sr.entities.SyncState.create({ sync_key: lockKey, ...lockData });
}

async function releaseLock(sr, lockRow, error = null) {
  if (!lockRow?.id) return;
  await sr.entities.SyncState.update(lockRow.id, {
    status: error ? 'error' : 'success',
    heartbeat_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    last_error: error ? (error.message || String(error)) : null,
    last_error_at: error ? new Date().toISOString() : null,
  });
  console.log(`[orchestrateTenantSync] Lock released: ${lockRow.sync_key}`);
}

async function refreshLock(sr, lockRow) {
  if (!lockRow?.id) return;
  await sr.entities.SyncState.update(lockRow.id, { heartbeat_at: new Date().toISOString() });
}

// ─── Watermark helpers ───────────────────────────────────────────────────────

async function getLastWatermark(sr, key) {
  try {
    const logs = await sr.entities.SyncLog.filter(
      { operation: 'sync_checkpoint', endpoint_or_step: key, status: 'success' },
      '-created_date', 1
    );
    const arr = Array.isArray(logs) ? logs : (logs?.data || []);
    return arr[0]?.watermark_timestamp ? new Date(arr[0].watermark_timestamp) : null;
  } catch { return null; }
}

async function saveCheckpoint(sr, key, watermark) {
  try {
    await sr.entities.SyncLog.create({
      operation: 'sync_checkpoint', endpoint_or_step: key, status: 'success',
      watermark_timestamp: watermark ? new Date(watermark).toISOString() : null,
      created_at: new Date().toISOString(),
    });
  } catch (_) {}
}

// ─── Step: timeline wrapper ───────────────────────────────────────────────────

async function runStep(sr, stepName, tenantId, syncRunId, fn) {
  const t0 = Date.now();
  await writeSyncLog(sr, { operation: 'sync_timeline', endpoint_or_step: `${stepName}_started`, tenant_id: tenantId, sync_run_id: syncRunId, status: 'info' });
  try {
    const result = await fn();
    await writeSyncLog(sr, { operation: 'sync_timeline', endpoint_or_step: `${stepName}_completed`, tenant_id: tenantId, sync_run_id: syncRunId, status: 'success', duration_ms: Date.now() - t0, row_count: result?.row_count || 0 });
    return result;
  } catch (error) {
    await writeSyncLog(sr, { operation: 'sync_timeline', endpoint_or_step: `${stepName}_failed`, tenant_id: tenantId, sync_run_id: syncRunId, status: 'error', duration_ms: Date.now() - t0, error_message: error.message }).catch(() => {});
    throw error;
  }
}

// ─── Tenant pipeline steps ───────────────────────────────────────────────────

async function syncRegistry(sr, relayUrl, relaySecret, siteParent, force, lockRow) {
   const syncKey = `tenant:${siteParent}:registry`;
   const syncState = await ensureSyncState(sr, { syncKey, tenantId: siteParent, step: 'registry', force });
   const isFullSync = syncState.requested_mode === 'full';
   const lastWatermark = isFullSync ? null : (syncState.watermark_timestamp ? new Date(syncState.watermark_timestamp) : null);
   let maxWatermark = lastWatermark;
   const pageSize = 100;
   let offset = 0;
   let totalCreated = 0, totalUpdated = 0, totalDeleted = 0;
   const t0 = Date.now();

   if (isFullSync && !syncState.purge_completed_at) {
     await markPurgeComplete(sr, syncState.id);
   }

   while (true) {
     if (offset > 0 && offset % (pageSize * 5) === 0) await refreshLock(sr, lockRow);

     const rows = await relayWithBackoff(relayUrl, relaySecret, 'getHazmatList', {
       site_parent: siteParent,
       page: Math.floor(offset / pageSize) + 1,
       pageSize,
       sinceLastSync: lastWatermark?.toISOString() || null,
     });
     if (rows.length === 0) break;
     const elapsedMs = Date.now() - t0;
     console.log(`[syncRegistry] page ${Math.floor(offset / pageSize) + 1}: ${rows.length} fetched, ${totalCreated + totalUpdated + totalDeleted} total processed, ${elapsedMs}ms elapsed`);

    rows.forEach(r => { if (r.last_updated_at) { const t = new Date(r.last_updated_at); if (!maxWatermark || t > maxWatermark) maxWatermark = t; } });

    const seen = new Set();
    const toCreate = [];
    const toDeleteKeys = [];
    
    rows.forEach(row => {
      if (!row.file_sha256 || !row.Site_Chem_Id) return;
      const key = `${row.file_sha256}|${row.Site_Chem_Id}`;
      if (seen.has(key)) return;
      seen.add(key);
      
      if (row.is_deleted || row.record_status === 'Deleted') {
        toDeleteKeys.push({ file_sha256: row.file_sha256, Site_Chem_Id: String(row.Site_Chem_Id) });
        return;
      }
      
      toCreate.push({
        tenant_id: siteParent, Site_Chem_Id: String(row.Site_Chem_Id),
        file_sha256: row.file_sha256 || '', Site_Parent: row.Site_Parent || '',
        Site: row.Site || '', product_name: row.product_name || '',
        supplier_name: row.supplier_name || '', Risk_Rating: row.Risk_Rating ?? null,
        Risk_Rating_Desc: row.Risk_Rating_Desc || '', pictogram_url: row.pictogram_url || '',
        ERP_Number: row.ERP_Number || '', Responsible_Department: row.Responsible_Department || '',
        Onsite_Contractor: row.Onsite_Contractor || '', Fasttrack_SDS: row.Fasttrack_SDS || '',
        Fasttrack_Img1: row.Fasttrack_Img1 || '', Fasttrack_Img2: row.Fasttrack_Img2 || '',
        Fasttrack_Vech_Reg: row.Fasttrack_Vech_Reg || '', Fasttrack_Supplier_Contact: row.Fasttrack_Supplier_Contact || '',
        Site_RA_Doc: row.Site_RA_Doc || '', Ra_Doc_Date: row.Ra_Doc_Date || null,
        Top_25_List: row.Top_25_List || '', Likelihood: row.Likelihood ?? null,
        status: row.record_status === 'Archived' ? 'Archived' : 'Active',
      });
    });

    if (toCreate.length > 0) {
      if (isFullSync) totalCreated += await insertRows(sr, 'HazMatRegistry', toCreate, lockRow);
      else totalUpdated += await upsertRows(sr, 'HazMatRegistry', toCreate, ['tenant_id', 'Site_Chem_Id'], true, lockRow);
    }

    // Delete tombstone records (batched for efficiency)
    const toDeleteIds = [];
    for (const key of toDeleteKeys) {
      try {
        const matches = await sr.entities.HazMatRegistry.filter({
          tenant_id: siteParent,
          file_sha256: key.file_sha256,
          Site_Chem_Id: key.Site_Chem_Id,
        });
        const records = Array.isArray(matches) ? matches : (matches?.data || []);
        toDeleteIds.push(...records.map(r => r.id));
      } catch (e) {
        console.warn(`[syncRegistry] Failed to fetch tombstone ${key.file_sha256}|${key.Site_Chem_Id}:`, e.message);
      }
    }

    // Batch delete IDs in parallel
    const DELETE_BATCH = 75;
    for (let i = 0; i < toDeleteIds.length; i += DELETE_BATCH) {
      const batch = toDeleteIds.slice(i, i + DELETE_BATCH);
      let attempts = 0;
      while (attempts < 5) {
        try {
          await Promise.all(batch.map(id => sr.entities.HazMatRegistry.delete(id)));
          totalDeleted += batch.length;
          if (lockRow) await refreshLock(sr, lockRow);
          break;
        } catch (e) {
          if (e.status === 429 || e.message?.includes('Rate limit')) {
            attempts++;
            await sleep(1000 * attempts);
          } else {
            throw e;
          }
        }
      }
      if (attempts < 5) await sleep(20); // minimal inter-batch delay
    }

    if (rows.length < pageSize) break;
    offset += pageSize;
    await sleep(100); // minimal inter-page delay
    }

    const totalDuration = Date.now() - t0;
    await markSyncSuccess(sr, syncState.id, maxWatermark);
    await writeSyncLog(sr, { operation: 'sync_step', endpoint_or_step: 'registry', tenant_id: siteParent, status: 'success', duration_ms: totalDuration, row_count: totalCreated + totalUpdated, deleted_count: totalDeleted });
    console.log(`[syncRegistry] completed: ${totalCreated + totalUpdated} created/updated, ${totalDeleted} deleted in ${totalDuration}ms`);
    return { row_count: totalCreated + totalUpdated, deleted_count: totalDeleted };
    }

async function syncProductMaster(sr, relayUrl, relaySecret, siteParent, force, lockRow) {
   const syncKey = `tenant:${siteParent}:productMaster`;
   const syncState = await ensureSyncState(sr, { syncKey, tenantId: siteParent, step: 'productMaster', force });
   const isFullSync = syncState.requested_mode === 'full';
   const lastWatermark = isFullSync ? null : (syncState.watermark_timestamp ? new Date(syncState.watermark_timestamp) : null);
   let maxWatermark = lastWatermark;
   const pageSize = 100;
   let offset = 0;
   let totalCreated = 0, totalUpdated = 0, totalDeleted = 0;
   const t0 = Date.now();

   if (isFullSync && !syncState.purge_completed_at) {
     await markPurgeComplete(sr, syncState.id);
   }

   while (true) {
     if (offset > 0 && offset % (pageSize * 5) === 0) await refreshLock(sr, lockRow);

     const rows = await relayWithBackoff(relayUrl, relaySecret, 'getProductMaster', {
       site_parent: siteParent, page: Math.floor(offset / pageSize) + 1, pageSize,
       sinceLastSync: lastWatermark?.toISOString() || null,
     });
     if (rows.length === 0) break;
     const elapsedMs = Date.now() - t0;
     console.log(`[syncProductMaster] page ${Math.floor(offset / pageSize) + 1}: ${rows.length} fetched, ${totalCreated + totalUpdated + totalDeleted} total processed, ${elapsedMs}ms elapsed`);

    rows.forEach(r => { if (r.last_updated_at) { const t = new Date(r.last_updated_at); if (!maxWatermark || t > maxWatermark) maxWatermark = t; } });

    const toCreate = [];
    const toDeleteShas = [];
    
    rows.forEach(row => {
      if (!row.file_sha256) {
        totalDeleted++;
        return;
      }
      
      if (row.is_deleted || row.record_status === 'Deleted') {
        toDeleteShas.push(row.file_sha256);
        return;
      }
      
      toCreate.push({
        tenant_id: siteParent, file_sha256: row.file_sha256 || '',
        product_name: row.product_name || '', supplier_name: row.supplier_name || '',
        supplier_key: '', product_key: '',
        supplier_key_loose: row.supplier_key_loose || '', product_key_loose: row.product_key_loose || '',
        sds_date: row.sds_date || null, is_current: true, version: null,
        valid_from: null, valid_to: null,
        pdf_url: row.pdf_url || '', pictogram_url: row.pictogram_url || '',
        nfpa_pictogram_url: row.nfpa_pictogram_url || '', NFPA_H: row.NFPA_H ?? null,
        NFPA_F: row.NFPA_F ?? null, NFPA_R: row.NFPA_R ?? null,
        signal_word: '', emergency_phone: row.emergency_phone || '',
        supplier_phone: row.supplier_phone || '', supplier_email: row.supplier_email || '',
        recommended_uses: row.recommended_uses || '', restrictions: row.restrictions || '',
        product_type: row.product_type || '', language: '',
        default_risk_rating: row.default_risk_rating ?? null, un_number: '',
        cas_number: '', product_code: '', notes: '',
      });
    });

    if (toCreate.length > 0) {
      if (isFullSync) totalCreated += await insertRows(sr, 'ProductMaster', toCreate, lockRow);
      else totalUpdated += await upsertRows(sr, 'ProductMaster', toCreate, ['tenant_id', 'file_sha256'], true, lockRow);
    }

    // Delete tombstone records (batched for efficiency)
    const toDeleteIds = [];
    for (const sha of toDeleteShas) {
      try {
        const matches = await sr.entities.ProductMaster.filter({
          tenant_id: siteParent,
          file_sha256: sha,
        });
        const records = Array.isArray(matches) ? matches : (matches?.data || []);
        toDeleteIds.push(...records.map(r => r.id));
      } catch (e) {
        console.warn(`[syncProductMaster] Failed to fetch tombstone ${sha}:`, e.message);
      }
    }

    // Batch delete IDs in parallel
    const DELETE_BATCH = 75;
    for (let i = 0; i < toDeleteIds.length; i += DELETE_BATCH) {
      const batch = toDeleteIds.slice(i, i + DELETE_BATCH);
      let attempts = 0;
      while (attempts < 5) {
        try {
          await Promise.all(batch.map(id => sr.entities.ProductMaster.delete(id)));
          totalDeleted += batch.length;
          if (lockRow) await refreshLock(sr, lockRow);
          break;
        } catch (e) {
          if (e.status === 429 || e.message?.includes('Rate limit')) {
            attempts++;
            await sleep(1000 * attempts);
          } else {
            throw e;
          }
        }
      }
      if (attempts < 5) await sleep(20); // minimal inter-batch delay
    }

    if (rows.length < pageSize) break;
    offset += pageSize;
    await sleep(100); // minimal inter-page delay
    }

    const totalDuration = Date.now() - t0;
    await markSyncSuccess(sr, syncState.id, maxWatermark);
    console.log(`[syncProductMaster] completed: ${totalCreated + totalUpdated} created/updated, ${totalDeleted} deleted in ${totalDuration}ms`);
    return { row_count: totalCreated + totalUpdated, deleted_count: totalDeleted };
    }

    /**
 * syncSha256Based
 *
 * Syncs composition/hazards/sds by:
 * 1. Reading all file_sha256 values from the already-synced ProductMaster (local DB — no relay call)
 * 2. Chunking them and calling the relay data endpoint in batches
 *
 * IMPORTANT: Does NOT call any relay endpoint to get the file list.
 */
async function syncSha256Based(sr, relayUrl, relaySecret, siteParent, force, lockRow, config) {
   const { step, entityName, relayDataEndpoint, keyFields, pageSize, mapRow } = config;
   const syncKey = `tenant:${siteParent}:${step}`;
   const syncState = await ensureSyncState(sr, { syncKey, tenantId: siteParent, step, force });
   const isFullSync = syncState.requested_mode === 'full';
   const lastWatermark = isFullSync ? null : (syncState.watermark_timestamp ? new Date(syncState.watermark_timestamp) : null);
   let maxWatermark = lastWatermark;
   let totalCreated = 0, totalUpdated = 0, totalDeleted = 0;

  // Build sha256 list from already-synced ProductMaster — no relay file-list call needed
  const sha256List = [];
  let pmOffset = 0;
  try {
    while (true) {
      const page = await sr.entities.ProductMaster.filter({ tenant_id: siteParent }, null, 1000, pmOffset);
      const rows = Array.isArray(page) ? page : (page?.data || []);
      if (rows.length === 0) break;
      rows.forEach(r => { if (r.file_sha256) sha256List.push(r.file_sha256); });
      if (rows.length < 1000) break;
      pmOffset += 1000;
      await sleep(200);
    }
    console.log(`[${step}] sha256 list: ${sha256List.length} entries from ProductMaster`);
  } catch (e) {
    console.error(`[${step}] Failed to build sha256 list from ProductMaster:`, e.message);
    throw e;
  }

  if (sha256List.length === 0) {
    await markSyncSuccess(sr, syncState.id, null);
    return { row_count: 0 };
  }

  if (isFullSync && !syncState.purge_completed_at) {
    await markPurgeComplete(sr, syncState.id);
  }

  const t0 = Date.now();
  const sha256Chunks = chunk(sha256List, 25); // reduced from 50 to minimize 429 contention
  for (let chunkIdx = 0; chunkIdx < sha256Chunks.length; chunkIdx++) {
    const sha256Chunk = sha256Chunks[chunkIdx];
    if (!Array.isArray(sha256Chunk) || sha256Chunk.length === 0) continue;
    const cleanChunk = Array.from(sha256Chunk.filter(s => typeof s === 'string' && s.length > 0));
    if (cleanChunk.length === 0) continue;
    const elapsedMs = Date.now() - t0;
    console.log(`[${step}] chunk ${chunkIdx + 1}/${sha256Chunks.length} (${cleanChunk.length} shas): processed ${totalCreated + totalUpdated}, ${elapsedMs}ms elapsed`);

    let offset = 0;
    let chunkFailed = false;
    while (!chunkFailed) {
      if (offset > 0 && offset % (pageSize * 10) === 0) await refreshLock(sr, lockRow);

      const fileListPayload = Array.isArray(cleanChunk) ? cleanChunk : Array.from(cleanChunk);
      let rows;
      try {
        rows = await relayWithBackoff(relayUrl, relaySecret, relayDataEndpoint, {
          file_sha256_list: fileListPayload,
          page: Math.floor(offset / pageSize) + 1,
          pageSize,
          sinceLastSync: lastWatermark?.toISOString() || null,
        });
      } catch (e) {
        console.error(`[${step}] Relay call failed at chunk ${chunkIdx + 1}, offset ${offset}:`, e.message);
        chunkFailed = true;
        throw e;
      }
      if (rows.length === 0) break;

      rows.forEach(r => { if (r.last_updated_at) { const t = new Date(r.last_updated_at); if (!maxWatermark || t > maxWatermark) maxWatermark = t; } });

      const seen = new Set();
      const toCreate = [];
      const toDelete = [];
      
      rows.forEach(row => {
        const mapped = mapRow(row, siteParent);
        if (!mapped) return;
        const key = keyFields.map(k => mapped[k]).join('|');
        if (seen.has(key)) return;
        seen.add(key);
        
        if (row.is_deleted || row.record_status === 'Deleted') {
          toDelete.push(mapped);
        } else {
          toCreate.push(mapped);
        }
      });

      if (toCreate.length > 0) {
        try {
          if (isFullSync) totalCreated += await insertRows(sr, entityName, toCreate, lockRow);
          else totalUpdated += await upsertRows(sr, entityName, toCreate, keyFields, true, lockRow);
        } catch (e) {
          console.error(`[${step}] DB insert/upsert failed at chunk ${chunkIdx + 1}, offset ${offset}:`, e.message);
          throw e;
        }
      }

      // Delete tombstone records (batched for efficiency)
      const toDeleteIds = [];
      for (const mapped of toDelete) {
        try {
          const filterQ = { tenant_id: mapped.tenant_id };
          keyFields.forEach(k => { if (k !== 'tenant_id') filterQ[k] = mapped[k]; });
          const matches = await sr.entities[entityName].filter(filterQ);
          const records = Array.isArray(matches) ? matches : (matches?.data || []);
          toDeleteIds.push(...records.map(r => r.id));
        } catch (e) {
          const keyStr = keyFields.map(k => `${k}=${mapped[k]}`).join('|');
          console.warn(`[${step}] Failed to fetch tombstone ${keyStr}:`, e.message);
        }
      }

      // Batch delete IDs in parallel
      const DELETE_BATCH = 25;
      for (let i = 0; i < toDeleteIds.length; i += DELETE_BATCH) {
        const batch = toDeleteIds.slice(i, i + DELETE_BATCH);
        let attempts = 0;
        while (attempts < 5) {
          try {
            await Promise.all(batch.map(id => sr.entities[entityName].delete(id)));
            totalDeleted += batch.length; // track deleted records separately
            if (lockRow) await refreshLock(sr, lockRow);
            break;
          } catch (e) {
            if (e.status === 429 || e.message?.includes('Rate limit')) {
              attempts++;
              await sleep(1000 * attempts);
            } else {
              throw e;
            }
          }
        }
        if (attempts < 5) await sleep(20); // minimal inter-batch delay
      }

      if (rows.length < pageSize) break;
      offset += pageSize;
      await sleep(300);
    }
  }

  const totalDuration = Date.now() - t0;
  await markSyncSuccess(sr, syncState.id, maxWatermark);
  console.log(`[${step}] completed: ${totalCreated + totalUpdated} created/updated, ${totalDeleted} deleted in ${totalDuration}ms`);
  return { row_count: totalCreated + totalUpdated, deleted_count: totalDeleted };
  }

async function syncSimplePaginated(sr, relayUrl, relaySecret, siteParent, force, lockRow, config) {
   const { step, entityName, relayEndpoint, keyField, pageSize, mapRow } = config;
   const checkpointKey = `tenant:${siteParent}:${step}`;
   const lastWatermark = force ? null : await getLastWatermark(sr, checkpointKey);
   const isFullSync = force || !lastWatermark;
   let maxWatermark = lastWatermark;
   let offset = 0;
   let totalCreated = 0, totalUpdated = 0, totalDeleted = 0;
   const t0 = Date.now();

   while (true) {
     if (offset > 0 && offset % (pageSize * 5) === 0) await refreshLock(sr, lockRow);

     const rows = await relayWithBackoff(relayUrl, relaySecret, relayEndpoint, {
       tenant_id: siteParent,
       site_parent: siteParent,
       page: Math.floor(offset / pageSize) + 1,
       pageSize,
       sinceLastSync: lastWatermark?.toISOString() || null,
     });
     if (rows.length === 0) break;
     const elapsedMs = Date.now() - t0;
     console.log(`[${step}] page ${Math.floor(offset / pageSize) + 1}: ${rows.length} fetched, ${totalCreated + totalUpdated + totalDeleted} total processed, ${elapsedMs}ms elapsed`);

    rows.forEach(r => {
      if (r.last_updated_at) {
        const t = new Date(r.last_updated_at);
        if (!maxWatermark || t > maxWatermark) maxWatermark = t;
      }
    });

    const toCreate = [];
    const toUpsert = [];
    const toDeleteSourceIds = [];

    rows.forEach(r => {
      if (r.is_deleted || r.record_status === 'Deleted') {
        if (r.id) toDeleteSourceIds.push(String(r.id));
        return;
      }
      const data = mapRow(r, siteParent);
      if (isFullSync) toCreate.push(data);
      else toUpsert.push(data);
    });

    if (toCreate.length > 0) totalCreated += await insertRows(sr, entityName, toCreate, lockRow);
    if (toUpsert.length > 0) totalUpdated += await upsertRows(sr, entityName, toUpsert, keyField, true, lockRow);

    const DELETE_BATCH = 75;
    for (let i = 0; i < toDeleteSourceIds.length; i += DELETE_BATCH) {
      const batch = toDeleteSourceIds.slice(i, i + DELETE_BATCH);
      for (const sourceId of batch) {
        const raw = await sr.entities[entityName].filter({ tenant_id: siteParent, source_id: sourceId });
        const matches = Array.isArray(raw) ? raw : (raw?.data || []);
        for (const row of matches) {
          let attempts = 0;
          while (attempts < 5) {
            try {
              await sr.entities[entityName].delete(row.id);
              totalDeleted++;
              break;
            } catch (e) {
              if (e.status === 429 || e.message?.includes('Rate limit')) {
                attempts++;
                await sleep(1000 * attempts);
              } else {
                throw e;
              }
            }
          }
        }
      }
      if (lockRow) await refreshLock(sr, lockRow);
      await sleep(20); // minimal inter-batch delay
      }

    if (rows.length < pageSize) break;
    offset += pageSize;
    await sleep(100); // minimal inter-page delay
    }

    const totalDuration = Date.now() - t0;
    await saveCheckpoint(sr, checkpointKey, maxWatermark);
    console.log(`[${step}] completed: ${totalCreated + totalUpdated} created/updated, ${totalDeleted} deleted in ${totalDuration}ms`);
    return { row_count: totalCreated + totalUpdated, deleted_count: totalDeleted };
    }

// ─── Lookup steps ────────────────────────────────────────────────────────────

async function syncLookup(sr, relayUrl, relaySecret, force, config) {
   const { step, entityName, checkpointKey, relayEndpoint, pageSize, mapRow, dedup } = config;
   const lastWatermark = force ? null : await getLastWatermark(sr, checkpointKey);
   const isFullSync = !lastWatermark || force;
   let maxWatermark = lastWatermark;
   let offset = 0;
   let totalCreated = 0;
   const t0 = Date.now();

   while (true) {
     const rows = await relayWithBackoff(relayUrl, relaySecret, relayEndpoint, {
       page: Math.floor(offset / pageSize) + 1, pageSize,
       sinceLastSync: !isFullSync ? lastWatermark?.toISOString() : null,
     });
     if (rows.length === 0) break;
     const elapsedMs = Date.now() - t0;
     console.log(`[${step}] page ${Math.floor(offset / pageSize) + 1}: ${rows.length} fetched, ${totalCreated} created, ${elapsedMs}ms elapsed`);

    rows.forEach(r => { const ts = r._lastupdated || r.last_updated_at; if (ts) { const t = new Date(ts); if (!maxWatermark || t > maxWatermark) maxWatermark = t; } });

    const seen = new Set();
    const toCreate = [];
    rows.forEach(row => {
      const mapped = mapRow(row);
      if (!mapped) return;
      if (dedup) {
        const key = dedup(mapped);
        if (seen.has(key)) return;
        seen.add(key);
      }
      if (!row._deleted) toCreate.push(mapped);
    });

    if (toCreate.length > 0) totalCreated += await insertRows(sr, entityName, toCreate, null); // lookups don't pass lock
    if (rows.length < pageSize) break;
    offset += pageSize;
    await sleep(100); // minimal inter-page delay
    }

    const totalDuration = Date.now() - t0;
    await saveCheckpoint(sr, checkpointKey, maxWatermark);
    await writeSyncLog(sr, { operation: 'sync_step', endpoint_or_step: step, status: 'success', duration_ms: totalDuration, row_count: totalCreated });
    console.log(`[${step}] completed: ${totalCreated} rows in ${totalDuration}ms`);
    return { row_count: totalCreated };
    }

async function runAllLookups(sr, relayUrl, relaySecret, force, tenantId, syncRunId, isFullSync) {
  const lookups = [
    {
      step: 'lookupGhsHazardCodes', entityName: 'GHSHazardCode', checkpointKey: 'global:ghsHazardCodes',
      relayEndpoint: 'getGHSCodes', pageSize: 500,
      mapRow: row => {
        const code = row.code || '';
        if (!code) return null;
        return {
          code,
          statement: row.combined_code_statement || row.statement || '',
          pictogram_img: row.pictogram_img || '',
          pictogram_code: '',
          type: row.type || 'H-Statement',
          hazard_class: row.hazard_class || '',
          hazard_category: row.hazard_category || '',
          signal_word: row.signal_word || '',
        };
      },
    },
    {
      step: 'lookupGhsPictograms', entityName: 'GHSPictogram', checkpointKey: 'global:ghsPictograms',
      relayEndpoint: 'getGHSPictograms', pageSize: 100,
      mapRow: row => {
        const description = row.label_description || '';
        if (!description) return null;
        return { description, hint_text: row.hint_text || '', pictogram_img: row.pictogram_img || '' };
      },
    },
    {
      step: 'lookupGhsPrecautionary', entityName: 'GHSPrecautionaryStatement', checkpointKey: 'global:ghsPrecautionary',
      relayEndpoint: 'getGHSPrecautionaryStatements', pageSize: 200,
      mapRow: row => {
        const code = row.code || '';
        if (!code) return null;
        return { code, description: row.combined_text || row.statement || '' };
      },
    },
    {
      step: 'lookupPPE', entityName: 'PPEReference', checkpointKey: 'global:ppe',
      relayEndpoint: 'getPPEReferences', pageSize: 500,
      mapRow: row => {
        const ppe_name = row.ppe_name || '';
        if (!ppe_name) return null;
        return { ppe_name, image_url: row.image_url || '' };
      },
      dedup: m => m.ppe_name,
    },
    {
      step: 'lookupNFPA', entityName: 'NFPAGuide', checkpointKey: 'global:nfpa',
      relayEndpoint: 'getNFPAGuides', pageSize: 1000,
      mapRow: row => {
        const rule = row.nfpa_rule || '';
        if (!rule) return null;
        return { class: row.class || '', level: String(row.level ?? ''), rule };
      },
    },
    {
      step: 'lookupGlossary', entityName: 'GlossaryTerm', checkpointKey: 'global:glossary',
      relayEndpoint: 'getGlossaryTerms', pageSize: 300,
      mapRow: row => {
        const category = row.category || '';
        const term = row.term || '';
        if (!category || !term) return null;
        return { category, term, abbreviation: row.abbreviation || '', definition: row.definition || '', tenant_id: '' };
      },
    },
  ];

  for (const config of lookups) {
    let success = false;
    const maxAttempts = isFullSync ? 5 : 1; // No retries for incremental, 5 for full
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await runStep(sr, config.step, tenantId, syncRunId, () =>
          syncLookup(sr, relayUrl, relaySecret, force, config)
        );
        success = true;
        break;
      } catch (e) {
        console.warn(`[orchestrateTenantSync] Lookup ${config.step} attempt ${attempt + 1}/${maxAttempts} failed:`, e.message);
        if (attempt < maxAttempts - 1) await sleep(Math.min(2000 * Math.pow(2, attempt), 30000));
      }
    }
    if (!success) {
      const msg = `[orchestrateTenantSync] Lookup ${config.step} ${isFullSync ? 'skipped after 5 retries' : 'failed (no retry on incremental)'}`;
      console.warn(msg);
    }
  }
}

// ─── Pipeline runner (synchronous) ──────────────────────────────────────────────

async function runPipeline(sr, relayUrl, relaySecret, site_parent, force, syncRunId) {
  const startTime = Date.now();
  let lock = null;
  let pipelineError = null;

  try {
    console.log(`[orchestrateTenantSync] Starting pipeline for ${site_parent}, syncRunId=${syncRunId}, force=${force}`);

    await writeSyncLog(sr, {
      operation: 'sync_timeline', endpoint_or_step: 'pipeline_started',
      tenant_id: site_parent, sync_run_id: syncRunId, status: 'info',
    });

    lock = await acquireLock(sr, site_parent, syncRunId);
    console.log(`[orchestrateTenantSync] Lock acquired for ${site_parent}`);

    // Warmup relay to avoid cold start delays during sync
    try {
      console.log('[orchestrateTenantSync] Warming up relay...');
      await relayWithBackoff(relayUrl, relaySecret, 'ping', {}, 3);
      console.log('[orchestrateTenantSync] Relay warmed up');
    } catch (e) {
      console.warn('[orchestrateTenantSync] Relay warmup failed (non-fatal):', e.message);
    }

    await runStep(sr, 'registry', site_parent, syncRunId, () =>
      syncRegistry(sr, relayUrl, relaySecret, site_parent, force, lock));

    await runStep(sr, 'productMaster', site_parent, syncRunId, () =>
      syncProductMaster(sr, relayUrl, relaySecret, site_parent, force, lock));

    await runStep(sr, 'composition', site_parent, syncRunId, () =>
      syncSha256Based(sr, relayUrl, relaySecret, site_parent, force, lock, {
        step: 'composition', entityName: 'Composition',
        relayDataEndpoint: 'getComposition',
        keyFields: ['tenant_id', 'file_sha256', 'chemical_name'], pageSize: 100,
        mapRow: (row, tenantId) => {
          if (!row.file_sha256 || !row.chemical_name) return null;
          return {
            tenant_id: tenantId, file_sha256: row.file_sha256, chemical_name: row.chemical_name,
            cas_number: row.cas_number || '', ec_number: row.ec_number || '',
            index_number: row.index_number || '', reach_registration: row.reach_registration || '',
            conc_value: row.conc_value ?? null, conc_min: row.conc_min ?? null,
            conc_max: row.conc_max ?? null, conc_unit: row.conc_unit || '%',
            hazard_classes: row.hazard_classes || '', hazard_categories: row.hazard_categories || '',
            hazard_statements: row.hazard_statements || '', m_factor: row.m_factor || '', notes: row.notes || '',
          };
        },
      }));

    await runStep(sr, 'hazards', site_parent, syncRunId, () =>
      syncSha256Based(sr, relayUrl, relaySecret, site_parent, force, lock, {
        step: 'hazards', entityName: 'Hazard',
        relayDataEndpoint: 'getHazards',
        keyFields: ['tenant_id', 'file_sha256', 'code'], pageSize: 500,
        mapRow: (row, tenantId) => {
          if (!row.file_sha256 || !row.code) return null;
          return {
            tenant_id: tenantId, file_sha256: row.file_sha256, signal_word: row.signal_word || '',
            statement_type: row.statement_type || '', pictogram_url: row.pictogram_url || '',
            code: row.code, label_code: row.label_code || '', statements: row.statements || '',
          };
        },
      }));

    await runStep(sr, 'sds', site_parent, syncRunId, () =>
      syncSha256Based(sr, relayUrl, relaySecret, site_parent, force, lock, {
        step: 'sds', entityName: 'SDSSection',
        relayDataEndpoint: 'getSDSSections',
        keyFields: ['tenant_id', 'file_sha256', 'section_number'], pageSize: 500,
        mapRow: (row, tenantId) => {
          if (!row.file_sha256 || row.section_number == null) return null;
          return {
            tenant_id: tenantId, file_sha256: row.file_sha256, section_number: row.section_number,
            text: row.text || '', abstained: row.abstained || false, reason: row.reason || '',
          };
        },
      }));

    for (const stepCfg of [
      {
        step: 'sites', entityName: 'Site', relayEndpoint: 'getSiteData', keyField: ['tenant_id', 'source_id'], pageSize: 100,
        mapRow: (r, tenantId) => ({
          tenant_id: tenantId, source_id: String(r.id || ''), name: r.name || '', site_parent: r.site_parent || r.Site_Parent || '',
          location: r.location || '', region: r.region || '',
          emergency_contact_name: r.emergency_contact_name || '',
          emergency_contact_phone: r.emergency_contact_phone || '',
          site_coordinator_name: r.site_coordinator_name || '',
          site_coordinator_email: r.site_coordinator_email || '',
          is_active: r.is_active !== false,
        }),
      },
      {
        step: 'suppliers', entityName: 'Supplier', relayEndpoint: 'getSupplierData', keyField: ['tenant_id', 'source_id'], pageSize: 100,
        mapRow: (r, tenantId) => ({
          tenant_id: tenantId, source_id: String(r.id || ''), name: r.name || '', contact_name: r.contact_name || '',
          contact_phone: r.contact_phone || '', contact_email: r.contact_email || '',
          address: r.address || '', country: r.country || '',
          emergency_phone: r.emergency_phone || '', is_active: r.is_active !== false,
        }),
      },
      {
        step: 'documents', entityName: 'Document', relayEndpoint: 'getDocumentManifest', keyField: ['tenant_id', 'source_id'], pageSize: 100,
        mapRow: (r, tenantId) => ({
          tenant_id: tenantId, source_id: String(r.id || ''), title: r.title || '', document_type: r.document_type || 'Other',
          file_url: r.file_url || '', filename: r.filename || '',
          site_id: r.site_id || '', site_name: r.site_name || '',
          product_master_id: r.product_master_id || '', registry_entry_id: r.registry_entry_id || '',
          version: r.version || '1.0', is_offline_priority: r.is_offline_priority || false,
          description: r.description || '', is_active: r.is_active !== false,
        }),
      },
    ]) {
      try {
        await runStep(sr, stepCfg.step, site_parent, syncRunId, () =>
          syncSimplePaginated(sr, relayUrl, relaySecret, site_parent, force, lock, stepCfg));
      } catch (e) {
        console.warn(`[orchestrateTenantSync] Step ${stepCfg.step} skipped: ${e.message}`);
        await writeSyncLog(sr, {
          operation: 'sync_timeline', endpoint_or_step: `${stepCfg.step}_skipped`,
          tenant_id: site_parent, sync_run_id: syncRunId, status: 'skipped',
          error_message: `Non-fatal: ${e.message}`,
        }).catch(() => {});
      }
    }

    await runAllLookups(sr, relayUrl, relaySecret, force, site_parent, syncRunId, force);

    const durationMs = Date.now() - startTime;
    await writeSyncLog(sr, {
      operation: 'sync_timeline', endpoint_or_step: 'pipeline_completed',
      tenant_id: site_parent, sync_run_id: syncRunId,
      status: 'success', duration_ms: durationMs,
    });

    console.log(`[orchestrateTenantSync] Pipeline completed for ${site_parent} in ${durationMs}ms`);

    return {
      success: true,
      sync_run_id: syncRunId,
      site_parent,
      duration_ms: durationMs,
    };

  } catch (error) {
    pipelineError = error;
    console.error('[orchestrateTenantSync] Pipeline failed:', error.message);
    await writeSyncLog(sr, {
      operation: 'sync_timeline', endpoint_or_step: 'pipeline_failed',
      tenant_id: site_parent, sync_run_id: syncRunId, status: 'error',
      error_message: error.message, duration_ms: Date.now() - startTime,
    }).catch(() => {});
    throw error;

  } finally {
    if (lock) {
      try { await releaseLock(sr, lock, pipelineError); }
      catch (e) { console.error('[orchestrateTenantSync] Lock release failed:', e.message); }
    }
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { site_parent, force = false, force_unlock = false } = body;
    if (!site_parent) return Response.json({ error: 'site_parent required' }, { status: 400 });

    const relayUrl = Deno.env.get('RELAY_URL');
    const relaySecret = Deno.env.get('RELAY_SECRET');
    const sr = base44.asServiceRole;

    if (!relayUrl || !relaySecret) {
      return Response.json({ error: 'Missing RELAY_URL or RELAY_SECRET' }, { status: 500 });
    }

    // Emergency: clear a stale lock without running the pipeline
    if (force_unlock) {
      const lockKey = getTenantLockKey(site_parent);
      // Direct filter — no duplicate cleanup to avoid 429s during active sync
      const raw = await sr.entities.SyncState.filter({ sync_key: lockKey });
      const rows = Array.isArray(raw) ? raw : (raw?.data || []);
      for (const row of rows) {
        try {
          await sr.entities.SyncState.update(row.id, {
            status: 'error',
            heartbeat_at: new Date(0).toISOString(),
            last_error: 'Force-unlocked by admin',
            last_error_at: new Date().toISOString()
          });
        } catch (_) {}
      }
      return Response.json({ success: true, message: `Lock cleared for ${site_parent}` });
    }

    const syncRunId = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    // SYNCHRONOUS: await the full pipeline before returning
    const result = await runPipeline(sr, relayUrl, relaySecret, site_parent, force, syncRunId);

    return Response.json({
      success: true,
      message: 'Pipeline completed successfully.',
      ...result,
    });

  } catch (error) {
    console.error('[orchestrateTenantSync] Handler error:', error.message);
    return Response.json({ error: error.message }, { status: error.statusCode || 500 });
  }
});