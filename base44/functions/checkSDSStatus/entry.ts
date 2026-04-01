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

    // Get the last 10 SDS-related events
    const logs = await sr.entities.SyncLog.filter(
      { operation: 'sync_timeline', tenant_id, endpoint_or_step: { $regex: '^sds_' } },
      '-created_date',
      10
    );
    const events = Array.isArray(logs) ? logs : (logs?.data || []);

    if (events.length === 0) {
      return Response.json({ status: 'no_data', message: 'No SDS sync events found' });
    }

    // Find the most recent terminal event (completed, failed, skipped)
    const latest = events.find(e => 
      e.endpoint_or_step.includes('_completed') || 
      e.endpoint_or_step.includes('_failed') || 
      e.endpoint_or_step.includes('_skipped')
    ) || events[0];

    const isRunning = latest.endpoint_or_step.includes('_started') && 
                      !events.some(e => 
                        e.endpoint_or_step.includes('_completed') || 
                        e.endpoint_or_step.includes('_failed')
                      );

    return Response.json({
      latest_event: latest.endpoint_or_step,
      status: isRunning ? 'running' : (latest.endpoint_or_step.includes('_completed') ? 'completed' : latest.endpoint_or_step.split('_')[1]),
      row_count: latest.row_count || null,
      duration_ms: latest.duration_ms || null,
      error_message: latest.error_message || null,
      created_at: latest.created_at,
      all_events: events.map(e => ({ event: e.endpoint_or_step, created_at: e.created_at, row_count: e.row_count })),
    });
  } catch (error) {
    console.error('[checkSDSStatus] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});