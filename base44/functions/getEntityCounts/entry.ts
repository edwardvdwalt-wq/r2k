/**
 * getEntityCounts
 *
 * Returns the true live count of each synced entity in Base44
 * for a given tenant, by paginating through all records.
 *
 * Source of truth: the actual entity tables, filtered by tenant_id.
 * Does NOT use SyncLog or any historical counter.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

async function countEntity(sr, entityName, filter) {
  let total = 0;
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const raw = await sr.entities[entityName].filter(filter, null, PAGE, offset);
    const page = Array.isArray(raw) ? raw : (raw?.data || []);
    total += page.length;
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return total;
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
    const tenantFilter = { tenant_id };

    // Tenant-scoped entities
    const [
      hazmatRegistry, productMaster, composition, hazard, sdsSection,
      site, supplier, document_
    ] = await Promise.all([
      countEntity(sr, 'HazMatRegistry',  tenantFilter),
      countEntity(sr, 'ProductMaster',   tenantFilter),
      countEntity(sr, 'Composition',     tenantFilter),
      countEntity(sr, 'Hazard',          tenantFilter),
      countEntity(sr, 'SDSSection',      tenantFilter),
      countEntity(sr, 'Site',            tenantFilter),
      countEntity(sr, 'Supplier',        tenantFilter),
      countEntity(sr, 'Document',        tenantFilter),
    ]);

    // Global lookup tables (no tenant filter)
    const [
      ghsHazardCode, ghsPictogram, ghsPrecautionaryStatement, ppeReference, nfpaGuide, glossaryTerm
    ] = await Promise.all([
      countEntity(sr, 'GHSHazardCode',              {}),
      countEntity(sr, 'GHSPictogram',               {}),
      countEntity(sr, 'GHSPrecautionaryStatement',  {}),
      countEntity(sr, 'PPEReference',               {}),
      countEntity(sr, 'NFPAGuide',                  {}),
      countEntity(sr, 'GlossaryTerm',               {}),
    ]);

    return Response.json({
      tenant_id,
      timestamp: new Date().toISOString(),
      tenant: { hazmatRegistry, productMaster, composition, hazard, sdsSection, site, supplier, document: document_ },
      lookups: { ghsHazardCode, ghsPictogram, ghsPrecautionaryStatement, ppeReference, nfpaGuide, glossaryTerm },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});