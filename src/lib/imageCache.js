/**
 * Image Cache — downloads and stores images in localStorage as data URLs.
 * Keys: hazmat_img_{tenantId}_{url_hash}
 *
 * Used during sync so all images are available offline.
 * For large image sets, silently skips images that fail or exceed storage quota.
 */

const IMG_PREFIX = 'hazmat_img';
const MAX_IMAGES = 200; // Guard against quota exhaustion

function imgKey(tenantId, url) {
  // Simple hash to shorten the URL into a storage key
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i);
    hash |= 0;
  }
  return `${IMG_PREFIX}_${tenantId}_${Math.abs(hash)}`;
}

/**
 * Get a cached image data URL, or return the original URL if not cached.
 */
export function getCachedImage(tenantId, url) {
  if (!url) return url;
  try {
    return localStorage.getItem(imgKey(tenantId, url)) || url;
  } catch {
    return url;
  }
}

/**
 * Download and cache an array of image URLs for a tenant.
 * Runs best-effort — network errors are silently skipped.
 */
export async function cacheImages(tenantId, urls) {
  const limited = urls.slice(0, MAX_IMAGES);

  for (const url of limited) {
    const key = imgKey(tenantId, url);
    if (localStorage.getItem(key)) continue; // Already cached

    try {
      const resp = await fetch(url, { mode: 'cors' });
      if (!resp.ok) continue;
      const blob = await resp.blob();
      const dataUrl = await blobToDataUrl(blob);
      localStorage.setItem(key, dataUrl);
    } catch {
      // Network error or CORS — skip silently
    }
  }
}

/**
 * Remove all cached images for tenants other than the current one.
 */
export function evictOtherTenantImages(currentTenantId) {
  const toDelete = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(IMG_PREFIX) && !k.includes(`_${currentTenantId}_`)) {
      toDelete.push(k);
    }
  }
  toDelete.forEach(k => localStorage.removeItem(k));
}

/**
 * Clear all cached images for a specific tenant.
 */
export function clearTenantImages(tenantId) {
  const toDelete = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(IMG_PREFIX) && k.includes(`_${tenantId}_`)) {
      toDelete.push(k);
    }
  }
  toDelete.forEach(k => localStorage.removeItem(k));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}