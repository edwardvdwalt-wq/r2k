/**
 * Offline Cache — lightweight metadata only.
 * Full entity data (71MB) exceeds browser localStorage limits (~5MB).
 * All entity data is fetched live from the Base44 API.
 */

const PREFIX = 'hazmat_cache';

export function cacheMeta(tenantId) {
  try {
    const raw = localStorage.getItem(`${PREFIX}_${tenantId}_meta`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function cacheWriteMeta(tenantId, meta) {
  try {
    localStorage.setItem(`${PREFIX}_${tenantId}_meta`, JSON.stringify(meta));
  } catch {}
}

// Kept for backward compatibility — always returns null (no data cached)
export function cacheRead(tenantId, table) { return null; }
export function cacheWrite(tenantId, table, rows) {}
export function evictOtherTenants(currentTenantId) {}
export function clearTenantCache(tenantId) {}