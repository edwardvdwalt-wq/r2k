import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const SYNC_LOCKS = {}; // In-memory lock per site_parent
const MAX_CONCURRENT_RELAY = 3;
let activeRelayCount = 0;

async function acquireLock(site_parent) {
  while (SYNC_LOCKS[site_parent]) {
    await new Promise(r => setTimeout(r, 100));
  }
  SYNC_LOCKS[site_parent] = true;
}

function releaseLock(site_parent) {
  delete SYNC_LOCKS[site_parent];
}

async function waitForRelaySlot() {
  while (activeRelayCount >= MAX_CONCURRENT_RELAY) {
    await new Promise(r => setTimeout(r, 50));
  }
  activeRelayCount++;
}

function releaseRelaySlot() {
  activeRelayCount--;
}

async function relayCall(url, secret, endpoint, params, retries = 3) {
  await waitForRelaySlot();
  try {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Relay-Secret': secret },
          body: JSON.stringify({ endpoint, ...params }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
        return (await res.json()).recordset || [];
      } catch (err) {
        if (attempt < retries) {
          const wait = Math.pow(2, attempt - 1) * 1000 + Math.random() * 300;
          await new Promise(r => setTimeout(r, wait));
        } else {
          throw err;
        }
      }
    }
  } finally {
    releaseRelaySlot();
  }
}

async function getCheckpoint(sr, key) {
  try {
    const logs = await sr.entities.SyncLog.filter(
      { operation: 'sync_checkpoint', endpoint_or_step: key, status: 'success' },
      '-created_date', 1
    );
    const arr = Array.isArray(logs) ? logs : (logs?.data || []);
    return arr.length > 0 ? new Date(arr[0].created_at) : null;
  } catch {
    return null;
  }
}

async function setCheckpoint(sr, key) {
  try {
    await sr.entities.SyncLog.create({
      operation: 'sync_checkpoint',
      endpoint_or_step: key,
      status: 'success',
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    // Silent fail for logging
  }
}

async function upsertBatch(sr, entity, rows, keyField, tenantFilter) {
  let count = 0;
  for (const row of rows) {
    const filter = tenantFilter ? { [keyField]: row[keyField], tenant_id: row.tenant_id } : { [keyField]: row[keyField] };
    const existing = await sr.entities[entity].filter(filter, null, 1);
    const arr = Array.isArray(existing) ? existing : (existing?.data || []);
    if (arr.length > 0) {
      await sr.entities[entity].update(arr[0].id, row);
    } else {
      await sr.entities[entity].create(row);
    }
    count++;
  }
  return count;
}

Deno.serve(async (req) => {
  const sr_ref = { current: null };
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const { site_parent, force } = await req.json();
    if (!site_parent) return Response.json({ error: 'site_parent required' }, { status: 400 });

    const relayUrl = Deno.env.get('RELAY_URL');
    const relaySecret = Deno.env.get('RELAY_SECRET');
    const sr = base44.asServiceRole;
    sr_ref.current = sr;

    // Acquire lock for this tenant
    await acquireLock(site_parent);

    try {
      // PASS 1: Top 25 (if applicable)
      // PASS 2: High/Very High risk
      // PASS 3: Everything else

      const hazmatCheckpoint = force ? null : await getCheckpoint(sr, `hazmat:${site_parent}`);
      
      let allHashes = [];
      let registryUpdated = 0;
      
      // Fetch hazmat list with priority filtering
      const hazmatRows = await relayCall(relayUrl, relaySecret, 'getHazmatList', {
        site_parent,
        sinceLastSync: hazmatCheckpoint?.toISOString(),
        pageSize: 1000,
      });

      if (hazmatRows.length > 0) {
        // Separate by priority
        const top25 = hazmatRows.filter(r => r.Top_25_List === 'Yes');
        const highRisk = hazmatRows.filter(r => ['High', 'Very High'].includes(r.Risk_Rating_Desc) && r.Top_25_List !== 'Yes');
        const rest = hazmatRows.filter(r => !['High', 'Very High'].includes(r.Risk_Rating_Desc) && r.Top_25_List !== 'Yes');

        const prioritized = [...top25, ...highRisk, ...rest];
        allHashes = prioritized.map(r => r.file_sha256).filter(Boolean);

        // Upsert registry
        registryUpdated = await upsertBatch(sr, 'HazMatRegistry', prioritized.map(r => ({
          tenant_id: site_parent,
          Site_Chem_Id: String(r.Site_Chem_Id),
          file_sha256: r.file_sha256 || '',
          Site_Parent: r.Site_Parent || '',
          Site: r.Site || '',
          product_name: r.product_name || '',
          supplier_name: r.supplier_name || '',
          Risk_Rating: r.Risk_Rating ?? null,
          Risk_Rating_Desc: r.Risk_Rating_Desc || '',
          pictogram_url: r.pictogram_url || '',
          ERP_Number: r.ERP_Number || '',
          Responsible_Department: r.Responsible_Department || '',
          Onsite_Contractor: r.Onsite_Contractor || '',
          Fasttrack_SDS: r.Fasttrack_SDS || '',
          Fasttrack_Img1: r.Fasttrack_Img1 || '',
          Fasttrack_Img2: r.Fasttrack_Img2 || '',
          Fasttrack_Vech_Reg: r.Fasttrack_Vech_Reg || '',
          Fasttrack_Supplier_Contact: r.Fasttrack_Supplier_Contact || '',
          Site_RA_Doc: r.Site_RA_Doc || '',
          Ra_Doc_Date: r.Ra_Doc_Date || null,
          Top_25_List: r.Top_25_List || '',
          Likelihood: r.Likelihood ?? null,
          status: r.record_status === 'Archived' ? 'Archived' : 'Active',
        })), 'Site_Chem_Id', true);

        await setCheckpoint(sr, `hazmat:${site_parent}`);
      }

      // BATCH PROCESSING: hazards, composition, core SDS (sections 4,5,6,7)
      let hazardsUpdated = 0, compositionUpdated = 0, sdsUpdated = 0;

      if (allHashes.length > 0) {
        const hazardsCheckpoint = force ? null : await getCheckpoint(sr, `hazards:${site_parent}`);
        const compositionCheckpoint = force ? null : await getCheckpoint(sr, `composition:${site_parent}`);
        const sdsCoreCheckpoint = force ? null : await getCheckpoint(sr, `sdsCore:${site_parent}`);

        const BATCH_SIZE = 150;
        for (let i = 0; i < allHashes.length; i += BATCH_SIZE) {
          const batch = allHashes.slice(i, i + BATCH_SIZE);

          // Hazards
          try {
            const hazardRows = await relayCall(relayUrl, relaySecret, 'getHazards', {
              file_sha256_list: batch,
              sinceLastSync: hazardsCheckpoint?.toISOString(),
            });
            if (hazardRows.length > 0) {
              hazardsUpdated += await upsertBatch(sr, 'Hazard', hazardRows.map(r => ({
                tenant_id: site_parent,
                file_sha256: r.file_sha256 || '',
                signal_word: r.signal_word || '',
                statement_type: r.statement_type || '',
                pictogram_url: r.pictogram_url || '',
                code: r.code || '',
                label_code: r.label_code || '',
                statements: r.statements || '',
              })), 'code', true);
            }
          } catch (e) {
            console.error('[syncHazards]', e.message);
          }

          // Composition
          try {
            const compRows = await relayCall(relayUrl, relaySecret, 'getComposition', {
              file_sha256_list: batch,
              sinceLastSync: compositionCheckpoint?.toISOString(),
            });
            if (compRows.length > 0) {
              compositionUpdated += await upsertBatch(sr, 'Composition', compRows.map(r => ({
                tenant_id: site_parent,
                file_sha256: r.file_sha256 || '',
                chemical_name: r.chemical_name || '',
                cas_number: r.cas_number || '',
                ec_number: r.ec_number || '',
                index_number: r.index_number || '',
                reach_registration: r.reach_registration || '',
                conc_value: r.conc_value ?? null,
                conc_min: r.conc_min ?? null,
                conc_max: r.conc_max ?? null,
                conc_unit: r.conc_unit || '%',
                hazard_classes: r.hazard_classes || '',
                hazard_categories: r.hazard_categories || '',
                hazard_statements: r.hazard_statements || '',
                m_factor: r.m_factor || '',
                notes: r.notes || '',
              })), 'chemical_name', true);
            }
          } catch (e) {
            console.error('[syncComposition]', e.message);
          }

          // SDS CORE ONLY (sections 4,5,6,7)
          try {
            const sdsRows = await relayCall(relayUrl, relaySecret, 'getSDSSections', {
              file_sha256_list: batch,
              section_numbers: [4, 5, 6, 7],
              sinceLastSync: sdsCoreCheckpoint?.toISOString(),
            });
            if (sdsRows.length > 0) {
              sdsUpdated += await upsertBatch(sr, 'SDSSection', sdsRows.map(r => ({
                tenant_id: site_parent,
                file_sha256: r.file_sha256 || '',
                section_number: r.section_number,
                text: r.text || '',
                abstained: r.abstained || false,
                reason: r.reason || '',
                is_core: true,
              })), 'section_number', true);
            }
          } catch (e) {
            console.error('[syncSDS]', e.message);
          }

          await new Promise(r => setTimeout(r, 100)); // Backoff between batches
        }

        await setCheckpoint(sr, `hazards:${site_parent}`);
        await setCheckpoint(sr, `composition:${site_parent}`);
        await setCheckpoint(sr, `sdsCore:${site_parent}`);
      }

      return Response.json({
        success: true,
        registry_updated: registryUpdated,
        hazards_updated: hazardsUpdated,
        composition_updated: compositionUpdated,
        sds_core_updated: sdsUpdated,
      });

    } finally {
      releaseLock(site_parent);
    }

  } catch (error) {
    console.error('[syncSiteHazmat]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});