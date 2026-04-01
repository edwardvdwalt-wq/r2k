import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    // Get recent sync logs (last 100 entries)
    const logs = await base44.entities.SyncLog.list('-created_at', 100);

    // Group by operation and time window
    const syncSteps = logs.filter(l => l.operation === 'sync_step');
    const syncStepsByTime = {};
    const triggerSequences = [];

    syncSteps.forEach(log => {
      const createdAt = new Date(log.created_at);
      const minute = new Date(createdAt.getTime() - (createdAt.getTime() % 60000)); // Round to minute
      const key = `${minute.toISOString()}_${log.tenant_id || 'global'}`;

      if (!syncStepsByTime[key]) {
        syncStepsByTime[key] = [];
      }
      syncStepsByTime[key].push({
        step: log.endpoint_or_step,
        status: log.status,
        tenant_id: log.tenant_id,
        created_at: log.created_at,
        error: log.error_message
      });
    });

    // Analyze trigger sequences
    Object.entries(syncStepsByTime).forEach(([key, steps]) => {
      const [time, tenant] = key.split('_');
      triggerSequences.push({
        time,
        tenant_id: tenant === 'global' ? null : tenant,
        step_count: steps.length,
        steps: steps.map(s => s.step),
        has_errors: steps.some(s => s.status === 'error'),
        error_steps: steps.filter(s => s.status === 'error').map(s => ({ step: s.step, error: s.error }))
      });
    });

    // Sort by time descending
    triggerSequences.sort((a, b) => new Date(b.time) - new Date(a.time));

    // Check for rapid repeated syncs (indication of loop)
    const recentSequences = triggerSequences.slice(0, 10);
    const suspiciousLoops = [];
    for (let i = 1; i < recentSequences.length; i++) {
      const current = recentSequences[i];
      const prev = recentSequences[i - 1];
      const timeDiffSecs = (new Date(prev.time) - new Date(current.time)) / 1000;
      if (timeDiffSecs < 10 && current.tenant_id === prev.tenant_id) {
        suspiciousLoops.push({
          time_diff_secs: timeDiffSecs,
          tenant_id: current.tenant_id,
          sequences: [current, prev]
        });
      }
    }

    return Response.json({
      recent_sequences: triggerSequences.slice(0, 20),
      suspicious_loops: suspiciousLoops,
      total_sync_logs: logs.length,
      analysis: {
        total_sequences: triggerSequences.length,
        sequences_with_errors: triggerSequences.filter(s => s.has_errors).length,
        is_looping: suspiciousLoops.length > 0
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});