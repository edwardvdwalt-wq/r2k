import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const { tenant_id } = await req.json();
    if (!tenant_id) {
      return Response.json({ error: 'tenant_id required' }, { status: 400 });
    }

    // Get last 200 sync logs for this tenant, sorted newest first
    const logs = await base44.entities.SyncLog.filter(
      { tenant_id },
      '-created_at',
      200
    );

    // Group consecutive sync starts by their run_id or timestamp proximity
    const syncRuns = [];
    let currentRun = null;

    logs.forEach((log) => {
      const isTimelineStart = log.operation === 'sync_timeline' && log.endpoint_or_step === 'pipeline_started';
      
      if (isTimelineStart) {
        if (currentRun) syncRuns.push(currentRun);
        currentRun = {
          started_at: log.created_at,
          run_id: log.sync_run_id || null,
          steps: [],
          triggered_from: null, // Will detect from relay logs
          errors: []
        };
      } else if (currentRun && log.tenant_id === tenant_id) {
        if (log.operation === 'sync_timeline') {
          currentRun.steps.push({
            step: log.endpoint_or_step,
            status: log.status,
            created_at: log.created_at
          });
        }
        if (log.status === 'error') {
          currentRun.errors.push({
            step: log.endpoint_or_step,
            error: log.error_message,
            status_code: log.error_stack?.match(/409|conflict/i) ? '409' : null
          });
        }
      }
    });
    if (currentRun) syncRuns.push(currentRun);

    // Check relay logs for 409 conflicts (indicates orchestrateTenantSync was re-triggered)
    const relayLogs = logs.filter(l => l.operation === 'relay_endpoint' && l.error_message?.includes('409'));
    
    // Look for context clues in request_params of recent sync steps
    const triggeredFrom = [];
    logs.slice(0, 30).forEach(log => {
      if (log.endpoint_or_step === 'pipeline_started' && log.request_params) {
        try {
          const params = JSON.parse(log.request_params);
          triggeredFrom.push({
            time: log.created_at,
            force: params.force,
            caller: params.caller || 'unknown'
          });
        } catch {}
      }
    });

    return Response.json({
      tenant_id,
      recent_runs: syncRuns.slice(0, 10),
      conflict_logs: relayLogs.slice(0, 5),
      trigger_history: triggeredFrom.slice(0, 5),
      analysis: {
        total_runs: syncRuns.length,
        runs_with_errors: syncRuns.filter(r => r.errors.length > 0).length,
        conflict_409_count: relayLogs.length,
        suspect_rapid_runs: syncRuns.slice(0, 10).filter((r, i, arr) => {
          if (i === 0) return false;
          const prev = arr[i - 1];
          const diffMs = new Date(r.started_at) - new Date(prev.started_at);
          return diffMs < 5000; // Less than 5 seconds apart
        }).length
      }
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});