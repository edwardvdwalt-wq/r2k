/**
 * Sync Service
 * ============
 * NOTE: With a 71MB dataset, localStorage offline caching is not feasible (5MB browser limit).
 * This service now only writes lightweight metadata (record counts, last sync time).
 * All data is fetched live from the Base44 API — no localStorage caching of entity rows.
 */

import { base44 } from '@/api/base44Client';
import { cacheWriteMeta } from '@/lib/offlineCache';

export async function runSync(tenantId, onProgress, options = {}) {
  const progress = (msg) => onProgress && onProgress(msg);
  const { isSuperAdmin = false } = options;

  const tenantFilter = (tenantId && !isSuperAdmin) ? { tenant_id: tenantId } : null;
  const cacheKey = tenantId || 'global';

  // ── Step 1: Driver table ──────────────────────────────────────────────────
  progress('Verifying HazMat registry…');
  const registry = tenantFilter
    ? await base44.entities.HazMatRegistry.filter(tenantFilter, '-created_date', 5000)
    : await base44.entities.HazMatRegistry.list('-created_date', 5000);

  const sha256Set = [...new Set(registry.map(r => r.file_sha256).filter(Boolean))];

  // ── Step 2–5: SDS-linked tables ───────────────────────────────────────────
  let products = [], hazards = [], compositions = [];

  if (sha256Set.length > 0) {
    progress('Verifying product master…');
    const allProducts = tenantFilter
      ? await base44.entities.ProductMaster.filter(tenantFilter, null, 5000)
      : await base44.entities.ProductMaster.list(null, 5000);
    products = allProducts.filter(p => sha256Set.includes(p.file_sha256) && p.is_current !== false);

    progress('Verifying hazard data…');
    const allHazards = tenantFilter
      ? await base44.entities.Hazard.filter(tenantFilter, null, 10000)
      : await base44.entities.Hazard.list(null, 10000);
    hazards = allHazards.filter(h => sha256Set.includes(h.file_sha256));

    progress('Verifying composition data…');
    const allCompositions = tenantFilter
      ? await base44.entities.Composition.filter(tenantFilter, null, 10000)
      : await base44.entities.Composition.list(null, 10000);
    compositions = allCompositions.filter(c => sha256Set.includes(c.file_sha256));

    progress('Verifying SDS sections…');
    // Not fetched here — too large; loaded on-demand per chemical detail view
  }

  // ── Step 6–7: Other tenant-scoped tables ─────────────────────────────────
  progress('Verifying sites…');
  const sites = tenantFilter
    ? await base44.entities.Site.filter(tenantFilter)
    : await base44.entities.Site.list(null, 2000);

  progress('Verifying documents…');
  const docs = tenantFilter
    ? await base44.entities.Document.filter(tenantFilter)
    : await base44.entities.Document.list(null, 2000);

  // ── Done: write only lightweight metadata ─────────────────────────────────
  cacheWriteMeta(cacheKey, {
    lastSync: new Date().toISOString(),
    registryCount: registry.length,
    sha256Count: sha256Set.length,
    productCount: products.length,
    hazardCount: hazards.length,
    compositionCount: compositions.length,
    siteCount: sites.length,
    docCount: docs.length,
  });

  progress('Sync complete');
  return { registry, sites, products };
}