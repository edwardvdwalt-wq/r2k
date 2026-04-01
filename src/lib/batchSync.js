/**
 * Batch Sync Utilities
 * Optimized data fetching with parallel requests and retry logic
 */

import { base44 } from '@/api/base44Client';

const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

/**
 * Retry with exponential backoff
 */
async function retryWithBackoff(fn, retries = 0) {
  try {
    return await fn();
  } catch (e) {
    if (retries < MAX_RETRIES && (e.status === 429 || !navigator.onLine)) {
      const delay = Math.pow(2, retries) * RETRY_DELAY;
      await new Promise(r => setTimeout(r, delay));
      return retryWithBackoff(fn, retries + 1);
    }
    throw e;
  }
}

/**
 * Fetch multiple entities in parallel with retries
 * @param {Array<{entity, filter, limit}>} requests
 * @param {Function} onProgress - Progress callback
 * @returns {Object} Results keyed by entity name
 */
export async function batchFetch(requests, onProgress = null) {
  const results = {};

  const requests_with_retry = requests.map(req => ({
    ...req,
    fn: () => {
      if (onProgress) onProgress(`Fetching ${req.entity}…`);
      
      const base = base44.entities[req.entity];
      if (!base) throw new Error(`Unknown entity: ${req.entity}`);

      if (req.filter) {
        return base.filter(req.filter, req.sort, req.limit || 5000);
      } else {
        return base.list(req.sort, req.limit || 5000);
      }
    }
  }));

  const promises = requests_with_retry.map(async req => {
    try {
      const data = await retryWithBackoff(req.fn);
      results[req.entity] = data || [];
    } catch (e) {
      console.warn(`Failed to fetch ${req.entity}:`, e);
      results[req.entity] = [];
    }
  });

  await Promise.all(promises);
  return results;
}

/**
 * Paginated fetch for large tables
 * @param {string} entity - Entity name
 * @param {object} filter - Filter criteria
 * @param {number} pageSize - Records per page
 * @param {Function} onProgress - Progress callback
 * @returns {Array} All records
 */
export async function paginatedFetch(entity, filter = null, pageSize = 500, onProgress = null) {
  const base = base44.entities[entity];
  if (!base) throw new Error(`Unknown entity: ${entity}`);

  let offset = 0;
  let allRecords = [];

  while (true) {
    if (onProgress) onProgress(`Fetching ${entity} (${offset})…`);

    let pageRecords;
    try {
      if (filter) {
        pageRecords = await retryWithBackoff(() => 
          base.filter(filter, '-created_date', pageSize)
        );
      } else {
        pageRecords = await retryWithBackoff(() => 
          base.list('-created_date', pageSize)
        );
      }
    } catch (e) {
      console.warn(`Pagination failed at offset ${offset}:`, e);
      break;
    }

    if (!pageRecords || pageRecords.length === 0) break;
    allRecords = allRecords.concat(pageRecords);
    
    if (pageRecords.length < pageSize) break;
    offset += pageSize;
  }

  return allRecords;
}

/**
 * Quick health check — fetch just a few records
 * @returns {boolean} True if API is responding
 */
export async function healthCheck() {
  try {
    await retryWithBackoff(() => 
      base44.entities.Tenant.list(null, 1)
    );
    return true;
  } catch (e) {
    console.error('Health check failed:', e);
    return false;
  }
}