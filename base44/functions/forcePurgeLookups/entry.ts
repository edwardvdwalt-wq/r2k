import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const LOOKUP_ENTITIES = [
  'GlossaryTerm',
  'GHSHazardCode',
  'GHSPictogram',
  'GHSPrecautionaryStatement',
  'PPEReference',
  'NFPAGuide',
];

const LOOKUP_CHECKPOINT_KEYS = [
  'global:glossary',
  'global:ghsHazardCodes',
  'global:ghsPictograms',
  'global:ghsPrecautionary',
  'global:ppe',
  'global:nfpa',
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function deleteAll(sr, entityName) {
  let deleted = 0;
  while (true) {
    const rows = await sr.entities[entityName].list(null, 100);
    const arr = Array.isArray(rows) ? rows : (rows?.data || []);
    if (arr.length === 0) break;
    
    // Delete in parallel chunks of 5 to avoid rate limits
    for (let i = 0; i < arr.length; i += 5) {
      const chunk = arr.slice(i, i + 5);
      let chunkAttempts = 0;
      while (chunkAttempts < 5) {
        try {
          await Promise.all(chunk.map(r => sr.entities[entityName].delete(r.id)));
          deleted += chunk.length;
          break;
        } catch (e) {
          if ((e.status === 429 || e.message?.includes('Rate limit')) && chunkAttempts < 4) {
            chunkAttempts++;
            await sleep(3000 * chunkAttempts);
          } else {
            throw e;
          }
        }
      }
      await sleep(1000);
    }
  }
  return deleted;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const sr = base44.asServiceRole;
    const results = {};

    // 1. Purge all lookup entity records
    for (const entity of LOOKUP_ENTITIES) {
      console.log(`[forcePurge] Deleting all ${entity} records…`);
      results[entity] = await deleteAll(sr, entity);
      console.log(`[forcePurge] Deleted ${results[entity]} from ${entity}`);
    }

    // 2. Delete all sync checkpoints for lookup tables
    for (const key of LOOKUP_CHECKPOINT_KEYS) {
      const existing = await sr.entities.SyncLog.filter(
        { operation: 'sync_checkpoint', endpoint_or_step: key },
        null, 100
      );
      const arr = Array.isArray(existing) ? existing : (existing?.data || []);
      for (const row of arr) {
        try { await sr.entities.SyncLog.delete(row.id); } catch (_) {}
      }
      console.log(`[forcePurge] Cleared checkpoint: ${key}`);
    }

    return Response.json({ success: true, purged: results });
  } catch (error) {
    console.error('[forcePurge] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});