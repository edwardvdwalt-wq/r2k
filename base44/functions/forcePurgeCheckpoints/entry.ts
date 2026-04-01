import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

async function clearCheckpoints(sr, tenantId, scope) {
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
  return cleared;
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
    const cleared = await clearCheckpoints(sr, tenant_id, scope);
    console.log(`[forcePurgeCheckpoints] Cleared ${cleared} checkpoints for scope=${scope}, tenant=${tenant_id}`);

    return Response.json({ success: true, scope, cleared });
  } catch (error) {
    console.error('[forcePurgeCheckpoints] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});