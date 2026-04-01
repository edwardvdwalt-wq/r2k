import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { tenant_id } = body;
    if (!tenant_id) return Response.json({ error: 'tenant_id required' }, { status: 400 });

    const sr = base44.asServiceRole;

    // Mark the lock as cancelled so orchestrator sees it on next check
    const lockKey = `lock:tenant:${tenant_id}:sync`;
    const raw = await sr.entities.SyncState.filter({ sync_key: lockKey });
    const locks = Array.isArray(raw) ? raw : (raw?.data || []);
    
    if (locks.length > 0) {
      const lock = locks[0];
      await sr.entities.SyncState.update(lock.id, {
        status: 'error',
        last_error: 'Kill signal sent by admin',
        last_error_at: new Date().toISOString(),
      });
    }

    // Force exit the current Deno isolate
    Deno.exit(1);

  } catch (error) {
    console.error('[killDenoProcess] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});