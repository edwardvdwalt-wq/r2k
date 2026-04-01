/**
 * purgeTenantEntities
 *
 * Synchronous purge — the request does not return until purge is complete.
 * Writes progress to SyncState (step: __purge__) so the UI can inspect status.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const TENANT_ENTITIES = ['HazMatRegistry', 'ProductMaster', 'Composition', 'Hazard', 'SDSSection', 'Site', 'Supplier', 'Document'];
const PURGE_KEY = (tenantId) => `tenant:${tenantId}:__purge__`;

async function purgeEntity(sr, tenantId, entityName) {
   console.log(`[purgeTenantEntities] Purging ${entityName} for ${tenantId}`);
   let deleted = 0;
   let pageNum = 0;

   while (true) {
     // Fetch from offset 0 repeatedly (we're always deleting first records)
     let page;
     let fetchAttempts = 0;
     while (fetchAttempts < 10) {
       try {
         const result = await sr.entities[entityName].filter({ tenant_id: tenantId }, null, 1000);
         page = Array.isArray(result) ? result : (result?.data || []);
         break;
       } catch (e) {
         if (e.status === 429 || e.message?.includes('Rate limit')) {
           fetchAttempts++;
           await sleep(Math.min(2000 * fetchAttempts, 15000));
         } else throw e;
       }
     }
     
     if (!page || page.length === 0) {
       // Verify once more to ensure truly empty
       let verifyPage;
       try {
         const verifyResult = await sr.entities[entityName].filter({ tenant_id: tenantId }, null, 100);
         verifyPage = Array.isArray(verifyResult) ? verifyResult : (verifyResult?.data || []);
       } catch (e) {
         console.warn(`[purgeTenantEntities] Verification fetch failed for ${entityName}:`, e.message);
         verifyPage = [];
       }
       
       if (verifyPage.length === 0) {
         console.log(`[purgeTenantEntities] ${entityName}: confirmed empty - ${deleted} total deleted`);
         break;
       }
       // Stale results, continue purging
       page = verifyPage;
     }

     pageNum++;
     console.log(`[purgeTenantEntities] ${entityName} batch ${pageNum}: deleting ${page.length} records (${deleted} total so far)`);

     // Delete in optimal batches (size=25, parallelism=3) with backoff
     for (let i = 0; i < page.length; i += 25) {
       const batch = page.slice(i, i + 25);
       let delAttempts = 0;
       while (delAttempts < 10) {
         try {
           // Parallelism of 3: split batch into chunks of 3 for concurrent processing
           const chunks = [];
           for (let j = 0; j < batch.length; j += 3) {
             chunks.push(batch.slice(j, j + 3));
           }
           
           let hasRateLimit = false;
           for (const chunk of chunks) {
             const results = await Promise.allSettled(
               chunk.map(row =>
                 sr.entities[entityName].delete(row.id)
                   .catch(e => {
                     if (e.status === 429 || e.message?.includes('Rate limit')) throw e;
                     if (e.status !== 404) throw e;
                   })
               )
             );
             
             results.forEach(result => {
               if (result.status === 'fulfilled') deleted++;
               else if (result.reason?.status === 429 || result.reason?.message?.includes('Rate limit')) {
                 hasRateLimit = true;
               } else if (result.reason?.status !== 404) {
                 throw result.reason;
               }
             });
           }
           
           if (!hasRateLimit) break;
           delAttempts++;
           const waitTime = Math.min(500 * Math.pow(2, delAttempts), 15000);
           await sleep(waitTime);
         } catch (e) {
           if (e.status === 429 || e.message?.includes('Rate limit')) {
             delAttempts++;
             if (delAttempts >= 10) throw e;
             const waitTime = Math.min(500 * Math.pow(2, delAttempts), 15000);
             await sleep(waitTime);
           } else {
             throw e;
           }
         }
       }
       await sleep(50); // minimal delay between batches
     }
   }

   return deleted;
 }

async function purgeAll(sr, tenantId) {
   const purgeKey = PURGE_KEY(tenantId);

   // Delete ALL SyncState records for this tenant to clear any blocking state
   try {
     const allSyncStates = await sr.entities.SyncState.filter({ tenant_id: tenantId });
     const syncStates = Array.isArray(allSyncStates) ? allSyncStates : (allSyncStates?.data || []);
     let deletedCount = 0;
     for (const state of syncStates) {
       try {
         await sr.entities.SyncState.delete(state.id);
         deletedCount++;
       } catch (e) {
         if (e.status !== 404) console.warn(`Failed to delete SyncState ${state.id}:`, e.message);
       }
     }
     if (deletedCount > 0) console.log(`[purgeTenantEntities] Deleted ${deletedCount} SyncState records for ${tenantId}`);
   } catch (e) {
     console.warn(`[purgeTenantEntities] Could not clear SyncState:`, e.message);
   }

   // Upsert a purge state record
   const existing = await sr.entities.SyncState.filter({ sync_key: purgeKey });
   const arr = Array.isArray(existing) ? existing : (existing?.data || []);
   const now = new Date().toISOString();
   const purgeState = arr[0]
     ? await sr.entities.SyncState.update(arr[0].id, {
         status: 'in_progress', heartbeat_at: now, last_error: null, last_error_at: null,
         purge_started_at: now, purge_completed_at: null,
       })
     : await sr.entities.SyncState.create({
         sync_key: purgeKey, tenant_id: tenantId, step: '__purge__',
         requested_mode: 'full', status: 'in_progress',
         heartbeat_at: now, purge_started_at: now,
       });

   const purgeStateId = purgeState?.id || arr[0]?.id;

  try {
     // Purge entities sequentially (not parallel) to avoid overload
     let totalDeleted = 0;
     for (const entityName of TENANT_ENTITIES) {
       const count = await purgeEntity(sr, tenantId, entityName);
       totalDeleted += count;
     }

     console.log(`[purgeTenantEntities] All entities purged for ${tenantId}: ${totalDeleted} total deleted`);

    // Reset SyncState for tenant so next orchestrator run does a clean full sync
    const syncStates = await sr.entities.SyncState.filter({ tenant_id: tenantId });
    const ssArr = Array.isArray(syncStates) ? syncStates : (syncStates?.data || []);
    for (const ss of ssArr) {
      if (ss.step === '__purge__') continue; // don't reset the purge tracking record
      await sr.entities.SyncState.update(ss.id, {
        status: 'error',
        heartbeat_at: new Date().toISOString(),
        purge_started_at: null, purge_completed_at: null,
        watermark_timestamp: null,
        last_error: 'Manual purge — requires full resync',
        last_error_at: new Date().toISOString(),
      });
      await sleep(100);
    }

    // Mark purge complete LAST — this is the signal for the UI to proceed
    if (purgeStateId) {
      await sr.entities.SyncState.update(purgeStateId, {
        status: 'success',
        heartbeat_at: new Date().toISOString(),
        purge_completed_at: new Date().toISOString(),
        last_error: null,
      });
      console.log(`[purgeTenantEntities] Purge marked complete for ${tenantId}`);
    }

  } catch (error) {
    console.error('[purgeTenantEntities] ERROR:', error.message);
    if (purgeStateId) {
      await sr.entities.SyncState.update(purgeStateId, {
        status: 'error',
        heartbeat_at: new Date().toISOString(),
        last_error: error.message,
        last_error_at: new Date().toISOString(),
      }).catch(() => {});
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { tenant_id } = body;
    if (!tenant_id) return Response.json({ error: 'tenant_id required' }, { status: 400 });

    const sr = base44.asServiceRole;

    // Run synchronously — wait for full completion before responding
    await purgeAll(sr, tenant_id);

    return Response.json({ success: true, message: 'Purge complete.', tenant_id });

  } catch (error) {
    console.error('[purgeTenantEntities] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});