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
    
    // Check for tenant sync lock
    const lockKey = `lock:tenant:${tenant_id}:sync`;
    const raw = await sr.entities.SyncState.filter({ sync_key: lockKey });
    const locks = Array.isArray(raw) ? raw : (raw?.data || []);
    
    if (locks.length === 0) {
      return Response.json({ locked: false, message: 'No locks found' });
    }

    locks.sort((a, b) => {
      const ta = new Date(a.heartbeat_at || a.updated_at || a.updated_date || a.started_at || a.created_at || a.created_date || 0).getTime();
      const tb = new Date(b.heartbeat_at || b.updated_at || b.updated_date || b.started_at || b.created_at || b.created_date || 0).getTime();
      return tb - ta;
    });

    const lock = locks[0];

    // Delete older duplicate lock rows
    for (let i = 1; i < locks.length; i++) {
      try {
        await sr.entities.SyncState.delete(locks[i].id);
      } catch (_) {
        // Silent fail on delete
      }
    }
    const isActive = lock.status === 'in_progress';
    const ageSource = lock.heartbeat_at || lock.updated_at || lock.updated_date || lock.started_at || lock.created_at || lock.created_date;
    const ageTs = ageSource ? new Date(ageSource).getTime() : null;
    const ageMs = Number.isFinite(ageTs) ? Date.now() - ageTs : null;
    const ageMin = Number.isFinite(ageMs) ? Math.round(ageMs / 60000) : null;

    // Auto-cleanup: if lock is stale (>10 min) and still in_progress, mark as error
    if (isActive && Number.isFinite(ageMin) && ageMin > 10) {
      await sr.entities.SyncState.update(lock.id, {
        status: 'error',
        heartbeat_at: new Date().toISOString(),
        last_error: `Stale lock cleared (no activity for ${ageMin} minutes)`,
        last_error_at: new Date().toISOString()
      });
      console.log(`[checkSyncLocks] Auto-cleared stale lock for ${tenant_id} (age: ${ageMin}min)`);
      return Response.json({
        locked: false,
        message: `✅ Stale lock cleared (was ${ageMin}min old). You can now retry the sync.`,
        auto_cleaned: true
      });
    }

    return Response.json({
      locked: isActive,
      lock: {
        id: lock.id,
        status: lock.status,
        created: lock.created_at,
        updated: lock.heartbeat_at || lock.updated_at || lock.updated_date,
        age_minutes: ageMin,
      },
      message: isActive 
        ? `Lock is ACTIVE (${ageMin}min old). Sync may be running.` 
        : `Lock exists but is not active (status: ${lock.status})`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});