/**
 * syncService.js — Frontend cache-refresh helper (READ-ONLY, non-authoritative)
 * ===============================================================================
 * LEGACY NOTE: This file does NOT orchestrate sync. It does NOT own pipeline state.
 *
 * Sync orchestration is exclusively backend-owned via the `orchestrateTenantSync`
 * Deno function. Pipeline status should be read from TenantContext (pipelineStatus,
 * currentStep, lastPipelineCompletedAt) which is sourced from SyncLog via syncTimeline.js.
 *
 * What this file DOES do:
 *   - Fetches live entity data from Base44 for the current tenant
 *   - Writes lightweight metadata (record counts, lastSync timestamp) to offlineCache
 *   - Used by mobile sync and dashboard to warm local state after the backend pipeline completes
 *
 * Do NOT use this function to determine sync eligibility, lock state, or pipeline status.
 */

import { base44 } from '@/api/base44Client';
import { cacheWriteMeta } from '@/lib/offlineCache';

/**
 * Refresh local cache metadata by fetching live entity counts from Base44.
 * Returns fetched data for immediate use (e.g. mobile warm-up, dashboard hydration).
 *
 * @param {string}   tenantId    - site_parent value
 * @param {Function} onProgress  - optional (msg: string) => void callback
 * @param {object}   options     - { isSuperAdmin?: boolean }
 */
export async function runSync(tenantId, onProgress, options = {}) {
  const progress = (msg) => onProgress?.(msg);
  const { isSuperAdmin = false } = options;

  const tenantFilter = (tenantId && !isSuperAdmin) ? { tenant_id: tenantId } : null;
  const cacheKey = tenantId || 'global';

  progress('Loading HazMat registry…');
  const registry = tenantFilter
    ? await base44.entities.HazMatRegistry.filter(tenantFilter, '-created_date', 5000)
    : await base44.entities.HazMatRegistry.list('-created_date', 5000);

  const sha256Set = [...new Set(registry.map(r => r.file_sha256).filter(Boolean))];

  let products = [], hazards = [], compositions = [];

  if (sha256Set.length > 0) {
    progress('Loading product master…');
    const allProducts = tenantFilter
      ? await base44.entities.ProductMaster.filter(tenantFilter, null, 5000)
      : await base44.entities.ProductMaster.list(null, 5000);
    products = allProducts.filter(p => sha256Set.includes(p.file_sha256) && p.is_current !== false);

    progress('Loading hazard data…');
    const allHazards = tenantFilter
      ? await base44.entities.Hazard.filter(tenantFilter, null, 10000)
      : await base44.entities.Hazard.list(null, 10000);
    hazards = allHazards.filter(h => sha256Set.includes(h.file_sha256));

    progress('Loading composition data…');
    const allCompositions = tenantFilter
      ? await base44.entities.Composition.filter(tenantFilter, null, 10000)
      : await base44.entities.Composition.list(null, 10000);
    compositions = allCompositions.filter(c => sha256Set.includes(c.file_sha256));
  }

  progress('Loading sites…');
  const sites = tenantFilter
    ? await base44.entities.Site.filter(tenantFilter)
    : await base44.entities.Site.list(null, 2000);

  progress('Loading documents…');
  const docs = tenantFilter
    ? await base44.entities.Document.filter(tenantFilter)
    : await base44.entities.Document.list(null, 2000);

  // Write lightweight metadata only — no entity rows are cached
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

  progress('Data loaded');
  return { registry, sites, products };
}