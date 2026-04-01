import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const sr = base44.asServiceRole;
    let cleared = 0;

    // Fetch and delete all sync logs in batches with rate limit handling
    while (true) {
      const logs = await sr.entities.SyncLog.list(null, 50);
      const arr = Array.isArray(logs) ? logs : (logs?.data || []);
      
      if (arr.length === 0) break;

      // Delete in serial batches of 5 with sleep to avoid rate limits
      for (let i = 0; i < arr.length; i += 5) {
        const batch = arr.slice(i, i + 5);
        let attempts = 0;
        let success = false;
        
        while (attempts < 5 && !success) {
          try {
            await Promise.all(batch.map(log => sr.entities.SyncLog.delete(log.id)));
            cleared += batch.length;
            success = true;
          } catch (e) {
            if (e.status === 429 || e.message?.includes('Rate limit')) {
              attempts++;
              const wait = Math.min(2000 * Math.pow(2, attempts - 1), 30000);
              console.log(`[clearSyncLog] 429 on batch, attempt ${attempts}, waiting ${wait}ms`);
              await sleep(wait);
            } else {
              throw e;
            }
          }
        }
        if (!success) throw new Error('Failed to delete batch after 5 attempts');
        await sleep(500);
      }
    }

    // Also clear all SyncState lock rows (sync_key starts with "lock:")
    let locksCleared = 0;
    const lockRows = await sr.entities.SyncState.list(null, 200);
    const lockArr = Array.isArray(lockRows) ? lockRows : (lockRows?.data || []);
    const locks = lockArr.filter(r => r.sync_key?.startsWith('lock:'));
    for (const lock of locks) {
      try {
        await sr.entities.SyncState.update(lock.id, {
          status: 'error',
          heartbeat_at: new Date(0).toISOString(),
          last_error: 'Cleared by clearSyncLog',
          last_error_at: new Date().toISOString(),
        });
        locksCleared++;
      } catch (_) {}
    }

    return Response.json({ success: true, cleared, locksCleared });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});