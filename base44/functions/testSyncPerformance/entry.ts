/**
 * testSyncPerformance
 *
 * Test different batch sizes for sync insertRows to find optimal parameters.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function testBatchConfig(sr, tenantId, batchSize) {
  const t0 = Date.now();
  let created = 0;
  let rateLimitHits = 0;

  try {
    // Create 50 synthetic test records
    const testRecords = Array.from({ length: 50 }, (_, i) => ({
      tenant_id: tenantId,
      file_sha256: 'test_' + Date.now() + '_' + i,
      product_name: 'test_product_' + i,
      supplier_name: 'test_supplier',
      is_current: true,
    }));

    console.log(`[testSyncPerformance] Testing ${testRecords.length} records with batchSize=${batchSize}`);

    // Test insertion in configured batch size
    for (let i = 0; i < testRecords.length; i += batchSize) {
      const batch = testRecords.slice(i, i + batchSize);
      console.log(`[testSyncPerformance] Inserting batch of ${batch.length}`);
      let attempts = 0;
      let inserted = false;
      while (attempts < 3) {
        try {
          await sr.entities.ProductMaster.bulkCreate(batch);
          created += batch.length;
          inserted = true;
          break;
        } catch (e) {
          console.error(`[testSyncPerformance] Error (attempt ${attempts + 1}):`, e.message);
          if (e.status === 429 || e.message?.includes('Rate limit')) {
            attempts++;
            rateLimitHits++;
            await sleep(500 * Math.pow(2, attempts));
          } else {
            break;
          }
        }
      }
      if (!inserted) console.warn(`[testSyncPerformance] Batch failed, skipping cleanup for this config`);
      await sleep(50);
    }

    const duration = Date.now() - t0;
    return {
      batchSize,
      created,
      rateLimitHits,
      duration,
      recordsPerSecond: created > 0 ? Math.round(created / (duration / 1000)) : 0,
    };

  } catch (e) {
    console.error('[testBatchConfig] catch:', e.message);
    return { batchSize, created: 0, rateLimitHits: 1, duration: Date.now() - t0, recordsPerSecond: 0 };
  }
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

    console.log('[testSyncPerformance] Starting tests...');

    const configs = [
      { batchSize: 100 },
      { batchSize: 150 },
      { batchSize: 200 },
    ];

    const results = [];
    for (const config of configs) {
      const result = await testBatchConfig(sr, tenant_id, config.batchSize);
      results.push(result);
      console.log(`[testSyncPerformance] Result:`, result);
      if (result.rateLimitHits > 3) {
        console.log('[testSyncPerformance] Too many 429s, stopping early');
        break;
      }
      await sleep(500);
    }

    results.sort((a, b) => b.recordsPerSecond - a.recordsPerSecond);

    return Response.json({
      success: true,
      tenant_id,
      results,
      recommendation: results[0] ? `Use batchSize=${results[0].batchSize} (${results[0].recordsPerSecond} rec/sec)` : 'No data',
    });

  } catch (error) {
    console.error('[testSyncPerformance] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});