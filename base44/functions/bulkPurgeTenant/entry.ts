import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { tenant_id, entity } = body;
    if (!tenant_id || !entity) return Response.json({ error: 'tenant_id and entity required' }, { status: 400 });

    const sr = base44.asServiceRole;
    let totalDeleted = 0;
    let page = 0;

    while (true) {
      let rows;
      try {
        rows = await sr.entities[entity].filter({ tenant_id }, null, 25);
      } catch (e) {
        if (e.message?.includes('Rate limit')) {
          console.log(`[purge] Rate limited on filter, waiting 5s...`);
          await sleep(5000);
          continue;
        }
        throw e;
      }

      const arr = Array.isArray(rows) ? rows : (rows?.data || []);
      if (arr.length === 0) break;

      for (const row of arr) {
        let attempts = 0;
          while (attempts < 5) {
            try {
              await sr.entities[entity].delete(row.id);
              totalDeleted++;
              break;
            } catch (e) {
              if (e.message?.includes('Rate limit')) {
                attempts++;
                const wait = 2000 * attempts;
                console.log(`[purge] Rate limited on delete, attempt ${attempts}, waiting ${wait}ms...`);
                await sleep(wait);
              } else if (e.message?.includes('not found')) {
                // Already deleted, skip
                break;
              } else {
                throw e;
              }
            }
          }
        await sleep(200);
      }

      page++;
      console.log(`[purge] ${entity}: page ${page}, total deleted: ${totalDeleted}`);
      await sleep(1000);
    }

    return Response.json({ success: true, entity, tenant_id, totalDeleted });
  } catch (error) {
    console.error('[bulkPurgeTenant] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});