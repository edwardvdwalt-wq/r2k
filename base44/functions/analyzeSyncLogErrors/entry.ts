import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { tenant_id } = body;
    if (!tenant_id) {
      return Response.json({ error: 'tenant_id required' }, { status: 400 });
    }

    // Get last 100 sync log entries for this tenant, most recent first
    const logs = await base44.entities.SyncLog.filter(
      { tenant_id },
      '-created_date',
      100
    );

    const entries = Array.isArray(logs) ? logs : (logs?.data || []);

    // Group by step and find errors
    const errorsByStep = {};
    const recentRuns = [];

    entries.forEach(log => {
      if (log.status === 'error') {
        const step = log.endpoint_or_step;
        if (!errorsByStep[step]) {
          errorsByStep[step] = [];
        }
        errorsByStep[step].push({
          timestamp: log.created_at,
          message: log.error_message,
          duration_ms: log.duration_ms,
          row_count: log.row_count,
        });
      }

      // Track pipeline runs (look for pipeline_started events)
      if (log.operation === 'sync_timeline' && log.endpoint_or_step === 'pipeline_started') {
        recentRuns.push({
          run_id: log.sync_run_id,
          started_at: log.created_at,
        });
      }
    });

    // Get unique steps that had errors
    const failedSteps = Object.keys(errorsByStep);

    // Get latest 3 runs
    const latestRuns = recentRuns.slice(0, 3);

    return Response.json({
      tenant_id,
      total_entries: entries.length,
      failed_steps: failedSteps,
      error_summary: errorsByStep,
      recent_runs: latestRuns,
      raw_logs: entries.slice(0, 20), // First 20 most recent
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});