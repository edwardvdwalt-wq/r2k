/**
 * Performance Monitoring
 * Track and log slow operations
 */

const SLOW_THRESHOLD = 2000; // 2 seconds

const metrics = {};

/**
 * Mark the start of a metric
 */
export function markStart(label) {
  metrics[label] = performance.now();
}

/**
 * Mark the end and log if slow
 */
export function markEnd(label) {
  if (!metrics[label]) {
    console.warn(`[Perf] No start mark for ${label}`);
    return;
  }

  const duration = performance.now() - metrics[label];
  delete metrics[label];

  if (duration > SLOW_THRESHOLD) {
    console.warn(`[Perf] ${label} took ${duration.toFixed(0)}ms (SLOW)`);
  } else {
    console.debug(`[Perf] ${label} took ${duration.toFixed(0)}ms`);
  }

  return duration;
}

/**
 * Measure async operation
 */
export async function measure(label, fn) {
  markStart(label);
  try {
    const result = await fn();
    markEnd(label);
    return result;
  } catch (e) {
    markEnd(label);
    throw e;
  }
}

/**
 * Get Core Web Vitals
 */
export function getCoreWebVitals() {
  const metrics = {
    fcp: null, // First Contentful Paint
    lcp: null, // Largest Contentful Paint
    cls: null, // Cumulative Layout Shift
    tti: null, // Time to Interactive
  };

  // FCP
  const fcpEntries = performance.getEntriesByName('first-contentful-paint');
  if (fcpEntries.length > 0) {
    metrics.fcp = fcpEntries[0].startTime;
  }

  // Navigation timing
  if (window.performance && window.performance.timing) {
    const t = window.performance.timing;
    if (t.domInteractive) {
      metrics.tti = t.domInteractive - t.navigationStart;
    }
  }

  return metrics;
}

/**
 * Log Core Web Vitals on page load
 */
export function logCoreWebVitals() {
  if (window.location.pathname === '/') {
    window.addEventListener('load', () => {
      setTimeout(() => {
        const vitals = getCoreWebVitals();
        console.log('[CWV]', vitals);
      }, 100);
    });
  }
}