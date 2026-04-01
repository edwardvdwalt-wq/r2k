import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const sr = base44.asServiceRole;
    
    // Use provided tenant_id or fetch from TenantUser
    let tenantId = body.tenant_id;
    
    if (!tenantId) {
      const tenantUserRaw = await sr.entities.TenantUser.filter({ user_email: user.email });
      const tenantUsers = Array.isArray(tenantUserRaw) ? tenantUserRaw : (tenantUserRaw?.data || []);
      
      if (tenantUsers.length === 0) {
        return Response.json({ error: 'Provide tenant_id in payload or ensure user is assigned to a tenant' }, { status: 400 });
      }
      tenantId = tenantUsers[0].tenant_id;
    }

    // Fetch all HazMatRegistry records for tenant
    let allRecords = [];
    let offset = 0;
    const pageSize = 1000;

    while (true) {
      const page = await sr.entities.HazMatRegistry.filter(
        { tenant_id: tenantId },
        null,
        pageSize,
        offset
      );
      const arr = Array.isArray(page) ? page : (page?.data || []);
      if (arr.length === 0) break;
      allRecords = allRecords.concat(arr);
      if (arr.length < pageSize) break;
      offset += pageSize;
      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`[purgeHazMatRegistry] Found ${allRecords.length} records to delete for tenant ${tenantId}`);

    // Delete in parallel batches (30 at a time)
    let deleted = 0;
    const BATCH_SIZE = 30;
    for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
      const batch = allRecords.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(r => sr.entities.HazMatRegistry.delete(r.id))
      );
      deleted += results.filter(r => r.status === 'fulfilled').length;
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`[purgeHazMatRegistry] Deleted ${deleted} records`);
    return Response.json({ success: true, deleted, tenantId });
  } catch (error) {
    console.error('[purgeHazMatRegistry] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});