import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { tenant_id } = body;
    if (!tenant_id) return Response.json({ error: 'tenant_id required' }, { status: 400 });

    const sr = base44.asServiceRole;

    // Get the last 200 sync log entries for this tenant, newest first
    const raw = await sr.entities.SyncLog.filter(
      { tenant_id },
      '-created_date',
      200
    );
    const logs = Array.isArray(raw) ? raw : (raw?.data || []);

    if (logs.length === 0) {
      return Response.json({ message: 'No sync logs found for this tenant' });
    }

    // Find the most recent pipeline_started to scope to one run
    const pipelineStart = logs.find(e => e.endpoint_or_step === 'pipeline_started');
    if (!pipelineStart) {
      return Response.json({ message: 'No pipeline found in sync logs' });
    }

    const runId = pipelineStart.sync_run_id;
    const runLogs = logs.filter(e => e.sync_run_id === runId);

    // Extract key events
    const pipelineEvent = runLogs.find(e => e.endpoint_or_step === 'pipeline_completed' || e.endpoint_or_step === 'pipeline_failed');
    const errors = runLogs.filter(e => e.status === 'error');
    const timeline = runLogs
      .filter(e => e.operation === 'sync_timeline')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    return Response.json({
      sync_run_id: runId,
      pipeline_started: pipelineStart.created_at,
      pipeline_status: pipelineEvent?.status || 'unknown',
      pipeline_completed: pipelineEvent?.created_at,
      error_count: errors.length,
      errors: errors.map(e => ({
        step: e.endpoint_or_step,
        message: e.error_message,
        created_at: e.created_at,
      })),
      timeline: timeline.map(e => ({
        step: e.endpoint_or_step,
        status: e.status,
        duration_ms: e.duration_ms,
        row_count: e.row_count,
        error_message: e.error_message,
        created_at: e.created_at,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});