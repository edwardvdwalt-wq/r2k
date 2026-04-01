/**
 * mobileSync — startup sync for mobile (iOS/Android).
 * Downloads the tenant-scoped dataset from Base44 entities into IndexedDB.
 * Also fetches all image URLs and caches them as base64.
 */

import { base44 } from '@/api/base44Client';
import { dbPutAll, dbClearStore, setMeta, getMeta } from '@/lib/mobileDb';

const IMAGE_FIELDS = [
  'pictogram_url', 'nfpa_pictogram_url', 'Fasttrack_Img1', 'Fasttrack_Img2',
];

async function fetchAsBase64(url) {
  if (!url || !url.startsWith('http')) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Run a full tenant-scoped sync into IndexedDB.
 * @param {string} tenantId  - tenant site_parent value
 * @param {Function} onProgress - (step: string, pct: number) => void
 */
export async function runMobileSync(tenantId, onProgress = () => {}) {
  const progress = (msg, pct) => onProgress(msg, pct);

  try {
    progress('Downloading registry…', 5);
    const registry = await base44.entities.HazMatRegistry.filter(
      { tenant_id: tenantId }, '-created_date', 5000
    );

    const sha256Set = [...new Set(registry.map(r => r.file_sha256).filter(Boolean))];

    progress('Downloading products…', 20);
    const allProducts = await base44.entities.ProductMaster.filter({ tenant_id: tenantId }, null, 5000);
    const products = allProducts.filter(p => sha256Set.includes(p.file_sha256));

    progress('Downloading hazards…', 35);
    const allHazards = await base44.entities.Hazard.filter({ tenant_id: tenantId }, null, 10000);
    const hazards = allHazards.filter(h => sha256Set.includes(h.file_sha256));

    progress('Downloading composition…', 50);
    const allCompositions = await base44.entities.Composition.filter({ tenant_id: tenantId }, null, 10000);
    const compositions = allCompositions.filter(c => sha256Set.includes(c.file_sha256));

    progress('Downloading SDS sections…', 60);
    const allSections = await base44.entities.SDSSection.filter({ tenant_id: tenantId }, null, 20000);
    const sdsSections = allSections.filter(s => sha256Set.includes(s.file_sha256));

    progress('Downloading glossary terms…', 65);
    const glossaryTerms = await base44.entities.GlossaryTerm.filter({ tenant_id: tenantId }, null, 5000);

  // ── Cache images ──────────────────────────────────────────────────────────
  progress('Caching images…', 70);
  const imageRecords = [];
  const allImageUrls = new Set();

  for (const row of [...registry, ...products]) {
    for (const field of IMAGE_FIELDS) {
      if (row[field]) allImageUrls.add(row[field]);
    }
  }

  const urlArray = [...allImageUrls];
  for (let i = 0; i < urlArray.length; i++) {
    const url = urlArray[i];
    const pct = 70 + Math.round((i / urlArray.length) * 20);
    progress(`Caching images (${i + 1}/${urlArray.length})…`, pct);
    const base64 = await fetchAsBase64(url);
    if (base64) imageRecords.push({ id: url, base64 });
  }

  // ── Write to IndexedDB ────────────────────────────────────────────────────
  progress('Saving to device…', 92);
  await Promise.all([
    dbClearStore('registry').then(() => dbPutAll('registry', registry)),
    dbClearStore('products').then(() => dbPutAll('products', products)),
    dbClearStore('hazards').then(() => dbPutAll('hazards', hazards)),
    dbClearStore('compositions').then(() => dbPutAll('compositions', compositions)),
    dbClearStore('sds_sections').then(() => dbPutAll('sds_sections', sdsSections)),
    dbClearStore('glossary_terms').then(() => dbPutAll('glossary_terms', glossaryTerms)),
    dbClearStore('images').then(() => dbPutAll('images', imageRecords)),
  ]);

  await setMeta('lastSync', new Date().toISOString());
  await setMeta('tenantId', tenantId);
  await setMeta('registryCount', registry.length);

    progress('Sync complete', 100);

    return { registry, products, hazards, compositions, sdsSections, glossaryTerms };
  } catch (error) {
    console.error('[mobileSync] Sync failed:', error.message, error.stack);
    throw new Error(`Sync failed: ${error.message || 'Unknown error'}`);
  }
}

/** Check if a valid local cache exists for the given tenant */
export async function hasCachedData(tenantId) {
  const cachedTenant = await getMeta('tenantId');
  const lastSync = await getMeta('lastSync');
  return cachedTenant === tenantId && !!lastSync;
}

/** Resolve an image URL to its cached base64, or fall back to the original URL */
export async function getCachedImage(url) {
  if (!url) return url;
  const { dbGet } = await import('@/lib/mobileDb');
  const rec = await dbGet('images', url);
  return rec?.base64 || url;
}

/** Clear all offline data and localStorage cache */
export async function clearAllCache() {
  const stores = ['registry', 'products', 'hazards', 'compositions', 'sds_sections', 'glossary_terms', 'images', 'meta'];
  for (const store of stores) {
    await dbClearStore(store);
  }
  // Clear localStorage image cache
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('hazmat_img_')) localStorage.removeItem(key);
  });
}