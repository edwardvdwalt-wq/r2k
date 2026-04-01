import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { site_parent, limit = 100 } = body;

    // Fetch recent sync logs
    const query = site_parent ? { tenant_id: site_parent } : {};
    const logs = await base44.asServiceRole.entities.SyncLog.filter(query, '-created_at', limit);
    const logArray = Array.isArray(logs) ? logs : (logs?.data || []);

    // Group by step and calculate metrics
    const stepMetrics = {};
    let totalDuration = 0;
    let stepCount = 0;

    logArray.forEach(log => {
      if (log.operation !== 'sync_step') return;

      const step = log.endpoint_or_step;
      if (!stepMetrics[step]) {
        stepMetrics[step] = {
          step,
          count: 0,
          totalDurationMs: 0,
          avgDurationMs: 0,
          maxDurationMs: 0,
          rowsProcessed: 0,
          errors: 0,
        };
      }

      const metrics = stepMetrics[step];
      metrics.count++;
      metrics.totalDurationMs += log.duration_ms || 0;
      metrics.maxDurationMs = Math.max(metrics.maxDurationMs, log.duration_ms || 0);
      metrics.rowsProcessed += log.row_count || 0;
      if (log.status === 'error') metrics.errors++;

      totalDuration += log.duration_ms || 0;
      stepCount++;
    });

    // Calculate averages and sort by slowest
    Object.values(stepMetrics).forEach(m => {
      m.avgDurationMs = Math.round(m.totalDurationMs / m.count);
    });

    const sortedByDuration = Object.values(stepMetrics).sort(
      (a, b) => b.totalDurationMs - a.totalDurationMs
    );

    // Find error steps
    const errorLogs = logArray.filter(log => log.status === 'error');
    const errorsByStep = {};
    errorLogs.forEach(log => {
      if (!errorsByStep[log.endpoint_or_step]) {
        errorsByStep[log.endpoint_or_step] = [];
      }
      errorsByStep[log.endpoint_or_step].push({
        error: log.error_message,
        timestamp: log.created_at,
      });
    });

    // Pagination analysis
    const paginatedSteps = logArray.filter(log => log.is_done !== undefined);
    const paginationMetrics = {};
    paginatedSteps.forEach(log => {
      const step = log.endpoint_or_step;
      if (!paginationMetrics[step]) {
        paginationMetrics[step] = {
          totalPages: 0,
          totalRows: 0,
          avgPageDuration: 0,
          totalPageDuration: 0,
        };
      }
      paginationMetrics[step].totalPages++;
      paginationMetrics[step].totalRows += log.row_count || 0;
      paginationMetrics[step].totalPageDuration += log.duration_ms || 0;
    });

    Object.values(paginationMetrics).forEach(m => {
      m.avgPageDuration = Math.round(m.totalPageDuration / m.totalPages);
    });

    return Response.json({
      summary: {
        logsAnalyzed: logArray.length,
        totalDurationMs: Math.round(totalDuration),
        totalDurationMin: (totalDuration / 60000).toFixed(2),
        stepCount,
        errorCount: errorLogs.length,
      },
      slowestSteps: sortedByDuration.slice(0, 10),
      paginationMetrics,
      errorsByStep: Object.keys(errorsByStep).length > 0 ? errorsByStep : null,
      recentErrors: errorLogs.slice(0, 5).map(log => ({
        step: log.endpoint_or_step,
        error: log.error_message,
        timestamp: log.created_at,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});