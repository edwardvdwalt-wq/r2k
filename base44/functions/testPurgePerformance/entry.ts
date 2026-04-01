/**
 * testPurgePerformance
 *
 * Test different batch sizes and parallelism to find optimal parameters
 * without hitting 429 rate limits.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function testBatchConfig(sr, tenantId, entityName, batchSize, parallelism) {
  const t0 = Date.now();
  let deleted = 0;
  let rateLimitHits = 0;
  let recordsInTest = 0;
  const MAX_RECORDS = 1000; // Limit test to 1000 records per config

  let page;
  try {
    const result = await sr.entities[entityName].filter({ tenant_id: tenantId }, null, MAX_RECORDS);
    page = Array.isArray(result) ? result : (result?.data || []);
  } catch (e) {
    if (e.status === 429) rateLimitHits++;
    return { batchSize, parallelism, deleted: 0, rateLimitHits: 1, duration: Date.now() - t0, recordsPerSecond: 0 };
  }

  if (!page || page.length === 0) {
    return { batchSize, parallelism, deleted: 0, rateLimitHits: 0, duration: Date.now() - t0, recordsPerSecond: 0 };
  }

  console.log(`[testBatchConfig] Loaded ${page.length} records for testing`);
  
  // Cap to 100 records max for speed
  page = page.slice(0, 100);

  // Delete in configured batches
  for (let i = 0; i < page.length; i += batchSize) {
    const batch = page.slice(i, i + batchSize);
    const chunks = [];
    for (let j = 0; j < batch.length; j += parallelism) {
      chunks.push(batch.slice(j, j + parallelism));
    }

    for (const chunk of chunks) {
      let delAttempts = 0;
      while (delAttempts < 3) {
        try {
          const results = await Promise.allSettled(
            chunk.map(row => sr.entities[entityName].delete(row.id))
          );
          
          let hasRateLimit = false;
          results.forEach(result => {
            if (result.status === 'fulfilled') deleted++;
            else if (result.reason?.status === 429) {
              hasRateLimit = true;
              rateLimitHits++;
            }
          });

          if (!hasRateLimit) break;
          delAttempts++;
          await sleep(500 * Math.pow(2, delAttempts));
        } catch (e) {
          if (e.status === 429) {
            delAttempts++;
            rateLimitHits++;
            await sleep(500 * Math.pow(2, delAttempts));
          } else {
            throw e;
          }
        }
      }
    }
  }

  const duration = Date.now() - t0;
  return {
    batchSize,
    parallelism,
    deleted,
    rateLimitHits,
    duration,
    recordsPerSecond: deleted > 0 ? Math.round(deleted / (duration / 1000)) : 0,
  };
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
    const entityName = body.entity || 'SDSSection'; // Parameterizable, default SDSSection

    console.log('[testPurgePerformance] Starting tests...');

    // Test matrix: conservative configs to avoid 429s
    const configs = [
      { batchSize: 25, parallelism: 3 },
      { batchSize: 30, parallelism: 5 },
      { batchSize: 40, parallelism: 5 },
    ];

    const results = [];
    for (const config of configs) {
      console.log(`[testPurgePerformance] Testing batch=${config.batchSize}, parallel=${config.parallelism}`);
      const result = await testBatchConfig(sr, tenant_id, entityName, config.batchSize, config.parallelism);
      results.push(result);
      console.log(`[testPurgePerformance] Result:`, result);
      if (result.rateLimitHits > 5) {
        console.log('[testPurgePerformance] Too many 429s, stopping early');
        break;
      }
      await sleep(500);
    }

    // Sort by records/sec (descending) to show best performing configs
    results.sort((a, b) => b.recordsPerSecond - a.recordsPerSecond);

    return Response.json({
      success: true,
      tenant_id,
      entity: entityName,
      results,
      recommendation: results[0] ? `Use batchSize=${results[0].batchSize}, parallelism=${results[0].parallelism} (${results[0].recordsPerSecond} rec/sec)` : 'No data',
    });

  } catch (error) {
    console.error('[testPurgePerformance] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});