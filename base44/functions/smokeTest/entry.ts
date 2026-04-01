import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * smokeTest
 *
 * End-to-end smoke test sequence:
 * 1. Relay ping
 * 2. getHazmatList (known tenant)
 * 3. getProductMaster (same tenant)
 * 4. getComposition (using file_sha256 from ProductMaster)
 * 5. orchestrateTenantSync (small tenant, full sync)
 * 6. Validate SyncLog entries
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const relayUrl = Deno.env.get('RELAY_URL');
    const relaySecret = Deno.env.get('RELAY_SECRET');
    const sr = base44.asServiceRole;

    const results = {
      relay_ping: null,
      relay_getHazmatList: null,
      relay_getProductMaster: null,
      relay_getComposition: null,
      orchestrate_sync: null,
      sync_logs: null,
      summary: { passed: 0, failed: 0, empty_expected: 0, empty_unexpected: 0 },
    };

    console.log('[smokeTest] Starting end-to-end test sequence...');

    // ─────────────────────────────────────────────────────────────────────────
    // 1. RELAY PING
    // ─────────────────────────────────────────────────────────────────────────
    try {
      console.log('[smokeTest] 1. Testing relay ping...');
      const pingRes = await fetch(relayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Relay-Secret': relaySecret },
        body: JSON.stringify({ endpoint: 'ping' }),
      });
      const pingData = await pingRes.json();
      results.relay_ping = {
        status: pingRes.status,
        ok: pingData.ok === true,
        error: pingRes.status !== 200 ? pingData.error : null,
      };
      if (pingData.ok) {
        console.log('[smokeTest] ✓ Relay ping successful');
        results.summary.passed++;
      } else {
        console.error('[smokeTest] ✗ Relay ping failed:', pingData.error);
        results.summary.failed++;
      }
    } catch (e) {
      console.error('[smokeTest] ✗ Relay ping error:', e.message);
      results.relay_ping = { error: e.message };
      results.summary.failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. RELAY GETHAZMATZLIST
    // ─────────────────────────────────────────────────────────────────────────
    let testTenant = 'Glencore_ECM'; // Known test tenant
    let hazmatRows = [];
    try {
      console.log(`[smokeTest] 2. Testing getHazmatList for tenant: ${testTenant}...`);
      const hazRes = await fetch(relayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Relay-Secret': relaySecret },
        body: JSON.stringify({
          endpoint: 'getHazmatList',
          site_parent: testTenant,
          page: 1,
          pageSize: 100,
        }),
      });
      const hazData = await hazRes.json();
      hazmatRows = hazData.recordset || [];
      const isValidRows = Array.isArray(hazmatRows) && hazmatRows.every(r => typeof r === 'object' && r.file_sha256);
      results.relay_getHazmatList = {
        status: hazRes.status,
        row_count: hazmatRows.length,
        has_file_sha256: isValidRows,
        error: hazRes.status !== 200 ? hazData.error : null,
      };
      if (hazmatRows.length > 0) {
        console.log(`[smokeTest] ✓ getHazmatList returned ${hazmatRows.length} rows`);
        results.summary.passed++;
      } else {
        console.log('[smokeTest] ⚠ getHazmatList returned 0 rows (empty but might be expected)');
        results.summary.empty_expected++;
      }
    } catch (e) {
      console.error('[smokeTest] ✗ getHazmatList error:', e.message);
      results.relay_getHazmatList = { error: e.message };
      results.summary.failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. RELAY GETPRODUCTMASTER
    // ─────────────────────────────────────────────────────────────────────────
    let productMasterRows = [];
    let sha256Values = [];
    try {
      console.log(`[smokeTest] 3. Testing getProductMaster for tenant: ${testTenant}...`);
      const pmRes = await fetch(relayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Relay-Secret': relaySecret },
        body: JSON.stringify({
          endpoint: 'getProductMaster',
          site_parent: testTenant,
          page: 1,
          pageSize: 100,
        }),
      });
      const pmData = await pmRes.json();
      productMasterRows = pmData.recordset || [];
      sha256Values = productMasterRows.filter(r => r.file_sha256).map(r => r.file_sha256).slice(0, 5);
      const isValidRows = Array.isArray(productMasterRows) && productMasterRows.every(r => typeof r === 'object' && r.file_sha256);
      results.relay_getProductMaster = {
        status: pmRes.status,
        row_count: productMasterRows.length,
        has_file_sha256: isValidRows,
        sample_sha256s: sha256Values,
        error: pmRes.status !== 200 ? pmData.error : null,
      };
      if (productMasterRows.length > 0) {
        console.log(`[smokeTest] ✓ getProductMaster returned ${productMasterRows.length} rows with ${sha256Values.length} usable SHA256s`);
        results.summary.passed++;
      } else {
        console.log('[smokeTest] ⚠ getProductMaster returned 0 rows (unexpected—downstream steps need SHA256s)');
        results.summary.empty_unexpected++;
      }
    } catch (e) {
      console.error('[smokeTest] ✗ getProductMaster error:', e.message);
      results.relay_getProductMaster = { error: e.message };
      results.summary.failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. RELAY GETCOMPOSITION (using SHA256s from ProductMaster)
    // ─────────────────────────────────────────────────────────────────────────
    let compositionRows = [];
    if (sha256Values.length > 0) {
      try {
        console.log(`[smokeTest] 4. Testing getComposition with ${sha256Values.length} file_sha256 values...`);
        const compRes = await fetch(relayUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Relay-Secret': relaySecret },
          body: JSON.stringify({
            endpoint: 'getComposition',
            file_sha256_list: sha256Values,
            page: 1,
            pageSize: 100,
          }),
        });
        const compData = await compRes.json();
        compositionRows = compData.recordset || [];
        const isValidRows = Array.isArray(compositionRows) && compositionRows.every(r => typeof r === 'object' && r.file_sha256);
        results.relay_getComposition = {
          status: compRes.status,
          row_count: compositionRows.length,
          has_file_sha256: isValidRows,
          error: compRes.status !== 200 ? compData.error : null,
        };
        if (compositionRows.length > 0) {
          console.log(`[smokeTest] ✓ getComposition returned ${compositionRows.length} rows`);
          results.summary.passed++;
        } else {
          console.log('[smokeTest] ⚠ getComposition returned 0 rows (may be expected if no composition data)');
          results.summary.empty_expected++;
        }
      } catch (e) {
        console.error('[smokeTest] ✗ getComposition error:', e.message);
        results.relay_getComposition = { error: e.message };
        results.summary.failed++;
      }
    } else {
      console.log('[smokeTest] ⊘ Skipping getComposition—no SHA256s from ProductMaster');
      results.relay_getComposition = { skipped: true, reason: 'no_sha256_values' };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. ORCHESTRATOR FULL SYNC
    // ─────────────────────────────────────────────────────────────────────────
    try {
      console.log(`[smokeTest] 5. Running orchestrateTenantSync for ${testTenant} (force=true)...`);
      const syncRes = await base44.functions.invoke('orchestrateTenantSync', {
        site_parent: testTenant,
        force: true,
      });
      const syncData = syncRes?.data;
      results.orchestrate_sync = {
        success: syncData?.success || false,
        sync_run_id: syncData?.sync_run_id,
        duration_ms: syncData?.duration_ms,
        error: syncData?.error,
      };
      if (syncData?.success) {
        console.log(`[smokeTest] ✓ Sync completed in ${syncData.duration_ms}ms`);
        results.summary.passed++;
      } else {
        console.error('[smokeTest] ✗ Sync failed:', syncData?.error);
        results.summary.failed++;
      }
    } catch (e) {
      console.error('[smokeTest] ✗ Sync error:', e.message);
      results.orchestrate_sync = { error: e.message };
      results.summary.failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. VALIDATE SYNCLOG ENTRIES
    // ─────────────────────────────────────────────────────────────────────────
    try {
      console.log('[smokeTest] 6. Validating SyncLog entries...');
      const logs = await sr.entities.SyncLog.filter({ tenant_id: testTenant }, '-created_date', 50);
      const logArray = Array.isArray(logs) ? logs : (logs?.data || []);
      const pipelineStart = logArray.find(l => l.endpoint_or_step === 'pipeline_started');
      const pipelineEnd = logArray.find(l => l.endpoint_or_step === 'pipeline_completed' || l.endpoint_or_step === 'pipeline_failed');
      const stepLogs = logArray.filter(l => l.endpoint_or_step?.includes('_completed') || l.endpoint_or_step?.includes('_failed'));

      results.sync_logs = {
        total_entries: logArray.length,
        has_pipeline_start: !!pipelineStart,
        has_pipeline_end: !!pipelineEnd,
        pipeline_status: pipelineEnd?.endpoint_or_step === 'pipeline_completed' ? 'success' : 'failed',
        completed_steps: stepLogs.filter(l => l.endpoint_or_step?.includes('_completed')).length,
        failed_steps: stepLogs.filter(l => l.endpoint_or_step?.includes('_failed')).length,
      };

      if (pipelineStart && pipelineEnd) {
        console.log(`[smokeTest] ✓ Pipeline lifecycle logged (started → ${results.sync_logs.pipeline_status})`);
        results.summary.passed++;
      } else {
        console.error('[smokeTest] ✗ Pipeline lifecycle incomplete in logs');
        results.summary.failed++;
      }
    } catch (e) {
      console.error('[smokeTest] ✗ SyncLog validation error:', e.message);
      results.sync_logs = { error: e.message };
      results.summary.failed++;
    }

    console.log('[smokeTest] Test sequence complete.');
    return Response.json(results);
  } catch (error) {
    console.error('[smokeTest] Handler error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});