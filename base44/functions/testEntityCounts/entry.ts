import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const sr = base44.asServiceRole;
    const tenant = 'Glencore_ECM';
    
    // Test each entity with proper pagination
    const results = {};
    
    // HazMatRegistry
    let regCount = 0;
    let regOffset = 0;
    while (true) {
      const rows = await sr.entities.HazMatRegistry.filter({ tenant_id: tenant }, null, 100);
      const arr = Array.isArray(rows) ? rows : (rows?.data || []);
      regCount += arr.length;
      if (arr.length < 100) break;
      regOffset++;
      if (regOffset > 100) break; // Safety limit
    }
    results.HazMatRegistry = { total: regCount, paginated: true };

    // ProductMaster
    let pmCount = 0;
    let pmOffset = 0;
    while (true) {
      const rows = await sr.entities.ProductMaster.filter({ tenant_id: tenant }, null, 100);
      const arr = Array.isArray(rows) ? rows : (rows?.data || []);
      pmCount += arr.length;
      if (arr.length < 100) break;
      pmOffset++;
      if (pmOffset > 100) break;
    }
    results.ProductMaster = { total: pmCount, paginated: true };

    // Composition
    let compCount = 0;
    let compOffset = 0;
    while (true) {
      const rows = await sr.entities.Composition.filter({ tenant_id: tenant }, null, 100);
      const arr = Array.isArray(rows) ? rows : (rows?.data || []);
      compCount += arr.length;
      if (arr.length < 100) break;
      compOffset++;
      if (compOffset > 100) break;
    }
    results.Composition = { total: compCount, paginated: true };

    // Hazard
    let hazCount = 0;
    let hazOffset = 0;
    while (true) {
      const rows = await sr.entities.Hazard.filter({ tenant_id: tenant }, null, 100);
      const arr = Array.isArray(rows) ? rows : (rows?.data || []);
      hazCount += arr.length;
      if (arr.length < 100) break;
      hazOffset++;
      if (hazOffset > 100) break;
    }
    results.Hazard = { total: hazCount, paginated: true };

    // SDSSection
    let sdsCount = 0;
    let sdsOffset = 0;
    while (true) {
      const rows = await sr.entities.SDSSection.filter({ tenant_id: tenant }, null, 100);
      const arr = Array.isArray(rows) ? rows : (rows?.data || []);
      sdsCount += arr.length;
      if (arr.length < 100) break;
      sdsOffset++;
      if (sdsOffset > 100) break;
    }
    results.SDSSection = { total: sdsCount, paginated: true };

    console.log('=== ACTUAL ENTITY COUNTS ===');
    console.log('HazMatRegistry:', regCount);
    console.log('ProductMaster:', pmCount);
    console.log('Composition:', compCount);
    console.log('Hazard:', hazCount);
    console.log('SDSSection:', sdsCount);

    return Response.json(results);
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});