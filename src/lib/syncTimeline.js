/**
 * syncTimeline.js — canonical timeline reconstruction from sync_timeline SyncLog entries.
 *
 * All components that need to interpret pipeline state MUST use these helpers
 * rather than re-implementing the parsing logic themselves.
 */

/**
 * Load recent sync_timeline entries for a tenant (descending by created_date).
 * Returns a plain array ready to pass to resolveCurrentPipeline / buildStepSummary.
 *
 * @param {object} entitiesClient  — base44.entities
 * @param {string} tenantId        — site_parent value
 * @param {number} limit           — how many entries to fetch (default 80)
 */
export async function loadTimelineEntries(entitiesClient, tenantId, limit = 80) {
  const raw = await entitiesClient.SyncLog.filter(
    { operation: 'sync_timeline', tenant_id: tenantId },
    '-created_date',
    limit
  );
  return Array.isArray(raw) ? raw : (raw?.data || []);
}

/**
 * Derive current pipeline status from a descending list of sync_timeline SyncLog entries.
 *
 * Rules:
 *  - Find the most recent pipeline_started → that defines the current run.
 *  - Scope all analysis to entries sharing that sync_run_id.
 *  - pipeline_completed in run  → status: 'success'
 *  - pipeline_failed    in run  → status: 'error'
 *  - pipeline_started   > 10 min ago with no terminal → status: 'idle' (stale)
 *  - otherwise                  → status: 'running', find active step
 *
 * Active step = most recent *_started whose matching *_completed / *_failed is absent in the run.
 *
 * @param {Array} entries  Descending-sorted sync_timeline rows
 * @returns {{
 *   pipelineStatus: 'idle'|'running'|'success'|'error',
 *   currentSyncRunId: string|null,
 *   currentStep: string|null,
 *   lastPipelineCompletedAt: string|null,
 * }}
 */
export function resolveCurrentPipeline(entries) {
  if (!entries || entries.length === 0) {
    return { pipelineStatus: 'idle', currentSyncRunId: null, currentStep: null, lastPipelineCompletedAt: null };
  }

  // Most recent pipeline_started scopes the run
  const startEntry = entries.find(e => e.endpoint_or_step === 'pipeline_started');
  if (!startEntry) {
    return { pipelineStatus: 'idle', currentSyncRunId: null, currentStep: null, lastPipelineCompletedAt: null };
  }

  const runId = startEntry.sync_run_id || startEntry.id;
  const runEntries = startEntry.sync_run_id
    ? entries.filter(e => e.sync_run_id === runId)
    : entries.slice(0, entries.indexOf(startEntry) + 1);

  // Terminal: completed
  const completedEntry = runEntries.find(e => e.endpoint_or_step === 'pipeline_completed');
  if (completedEntry) {
    return {
      pipelineStatus: 'success',
      currentSyncRunId: runId,
      currentStep: null,
      lastPipelineCompletedAt: completedEntry.created_at || completedEntry.created_date || null,
    };
  }

  // Terminal: failed
  const failedEntry = runEntries.find(e => e.endpoint_or_step === 'pipeline_failed');
  if (failedEntry) {
    return {
      pipelineStatus: 'error',
      currentSyncRunId: runId,
      currentStep: null,
      lastPipelineCompletedAt: null,
    };
  }

  // Stale start (> 10 min with no terminal event)
  const startTime = new Date(startEntry.created_at || startEntry.created_date || 0).getTime();
  if (startTime > 0 && (Date.now() - startTime) > 10 * 60 * 1000) {
    return { pipelineStatus: 'idle', currentSyncRunId: runId, currentStep: null, lastPipelineCompletedAt: null };
  }

  // Running — find the active step (most recent *_started without a terminal companion)
  const activeStepEntry = runEntries.find(e => {
    const m = e.endpoint_or_step?.match(/^(.+)_started$/);
    if (!m) return false;
    const key = m[1];
    return !runEntries.find(
      f => f.endpoint_or_step === `${key}_completed` || f.endpoint_or_step === `${key}_failed`
    );
  });
  const currentStep = activeStepEntry
    ? activeStepEntry.endpoint_or_step.replace('_started', '')
    : null;

  return { pipelineStatus: 'running', currentSyncRunId: runId, currentStep, lastPipelineCompletedAt: null };
}

/**
 * Build a per-step summary map from run-scoped timeline entries.
 * Each value has the shape: { status, row_count, duration_ms, completed_at, error_message }
 *
 * Status values: 'running' | 'success' | 'error' | 'skipped'
 *
 * @param {Array}  entries     Full descending timeline entries (same list passed to resolveCurrentPipeline)
 * @param {string} runId       currentSyncRunId returned by resolveCurrentPipeline
 * @returns {Object}           Map keyed by step name, e.g. { registry: { status: 'success', ... } }
 */
export function buildStepSummary(entries, runId) {
  if (!entries || !runId) return {};

  const runEntries = entries.filter(e => e.sync_run_id === runId);
  const summary = {};
  const seenSteps = new Set();

  // Entries are newest-first; process terminal events before started
  for (const entry of runEntries) {
    const ep = entry.endpoint_or_step;
    // Skip pipeline-level events
    if (/^pipeline_/.test(ep)) continue;

    const match = ep.match(/^(.+)_(started|completed|failed|skipped)$/);
    if (!match) continue;
    const [, stepKey, eventType] = match;

    if (seenSteps.has(stepKey)) continue;

    if (eventType === 'completed') {
      summary[stepKey] = {
        status: 'success',
        row_count: entry.row_count ?? null,
        duration_ms: entry.duration_ms ?? null,
        completed_at: entry.created_at || entry.created_date || null,
        error_message: null,
      };
      seenSteps.add(stepKey);
    } else if (eventType === 'failed') {
      summary[stepKey] = {
        status: 'error',
        row_count: null,
        duration_ms: null,
        completed_at: null,
        error_message: entry.error_message || 'Step failed',
      };
      seenSteps.add(stepKey);
    } else if (eventType === 'skipped') {
      summary[stepKey] = {
        status: 'skipped',
        row_count: null,
        duration_ms: null,
        completed_at: null,
        error_message: entry.error_message || null,
      };
      seenSteps.add(stepKey);
    } else if (eventType === 'started') {
      // Only mark running if no terminal event already recorded
      if (!summary[stepKey]) {
        summary[stepKey] = {
          status: 'running',
          row_count: null,
          duration_ms: null,
          completed_at: null,
          error_message: null,
        };
      }
    }
  }

  return summary;
}