import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { tenant_id } = body;
    if (!tenant_id) return Response.json({ error: 'tenant_id required' }, { status: 400 });

    const sr = base44.asServiceRole;
    const PAGE_SIZE = 500;
    let all = [];
    let offset = 0;

    while (true) {
      const res = await sr.entities.HazMatRegistry.filter(
        { tenant_id },
        'created_date',
        PAGE_SIZE,
        offset
      );
      const arr = Array.isArray(res) ? res : (res?.data || []);
      console.log(`[getAllRegistry] offset=${offset} got ${arr.length} rows`);
      all = all.concat(arr);
      if (arr.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    console.log(`[getAllRegistry] total fetched: ${all.length}`);
    return Response.json({ data: all, total: all.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});