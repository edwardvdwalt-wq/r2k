import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// All tenant-scoped entities
const TENANT_ENTITIES = [
  'HazMatRegistry',
  'ProductMaster',
  'Composition',
  'Hazard',
  'SDSSection',
  'Site',
  'Supplier',
  'Document',
];

// All global lookup entities
const LOOKUP_ENTITIES = [
  'GlossaryTerm',
  'GHSHazardCode',
  'GHSPictogram',
  'GHSPrecautionaryStatement',
  'PPEReference',
  'NFPAGuide',
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function deleteAll(sr, entityName, tenantId) {
  let deleted = 0;
  while (true) {
    const filter = tenantId ? { tenant_id: tenantId } : {};
    const rows = await sr.entities[entityName].filter(filter, null, 200);
    const arr = Array.isArray(rows) ? rows : (rows?.data || []);
    if (arr.length === 0) break;
    for (const row of arr) {
      let attempts = 0;
      while (attempts < 5) {
        try {
          await sr.entities[entityName].delete(row.id);
          deleted++;
          break;
        } catch (e) {
          if (e.status === 429) {
            attempts++;
            await sleep(2000 * attempts);
          } else {
            throw e;
          }
        }
      }
    }
    await sleep(300);
  }
  return deleted;
}

async function clearCheckpoints(sr, tenantId, scope) {
  // Clear all sync checkpoint logs for the given scope ('tenant', 'lookup', or 'all')
  const all = await sr.entities.SyncLog.filter({ operation: 'sync_checkpoint' }, null, 500);
  const arr = Array.isArray(all) ? all : (all?.data || []);
  let cleared = 0;
  for (const row of arr) {
    const key = row.endpoint_or_step || '';
    const isLookup = key.startsWith('global:');
    const isTenant = !isLookup && key.includes(':');
    
    let shouldClear = false;
    if (scope === 'all') {
      shouldClear = true;
    } else if (scope === 'lookup' && isLookup) {
      shouldClear = true;
    } else if (scope === 'tenant' && isTenant && key.startsWith(tenantId + ':')) {
      shouldClear = true;
    }
    
    if (shouldClear) {
      try {
        await sr.entities.SyncLog.delete(row.id);
        cleared++;
      } catch (_) {}
    }
  }
  console.log(`[forcePurgeAll] Cleared ${cleared} checkpoints for scope=${scope}`);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { tenant_id, scope } = body; // scope: 'lookup' | 'tenant' | 'all'

    if (!scope) return Response.json({ error: 'scope required: lookup | tenant | all' }, { status: 400 });
    if ((scope === 'tenant' || scope === 'all') && !tenant_id) {
      return Response.json({ error: 'tenant_id required for tenant/all scope' }, { status: 400 });
    }

    const sr = base44.asServiceRole;
    const results = {};

    if (scope === 'lookup' || scope === 'all') {
      for (const entity of LOOKUP_ENTITIES) {
        console.log(`[forcePurgeAll] Deleting all ${entity}…`);
        results[entity] = await deleteAll(sr, entity, null);
      }
    }

    if (scope === 'tenant' || scope === 'all') {
      for (const entity of TENANT_ENTITIES) {
        console.log(`[forcePurgeAll] Deleting ${entity} for tenant ${tenant_id}…`);
        results[entity] = await deleteAll(sr, entity, tenant_id);
      }
    }

    // Clear checkpoints
    await clearCheckpoints(sr, tenant_id, scope);
    console.log(`[forcePurgeAll] Checkpoints cleared for scope=${scope}`);

    return Response.json({ success: true, scope, purged: results });
  } catch (error) {
    console.error('[forcePurgeAll] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});