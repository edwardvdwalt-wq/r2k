// Shared logging helpers for sync operations
// Provides dual-logging (console JSON + entity persistence)

// Create log entry object (ready for both console and entity write)
export function createRelayLog(endpoint, requestParams, status, durationMs, rowCount, errorMessage = null, errorStack = null) {
  return {
    operation: 'relay_endpoint',
    endpoint_or_step: endpoint,
    request_params: JSON.stringify(requestParams || {}),
    status,
    duration_ms: durationMs,
    row_count: rowCount,
    error_message: errorMessage,
    error_stack: errorStack,
  };
}

export function createSyncLog(step, tenantId, status, durationMs, created, deleted, archived, offset, pageSize, nextOffset, isDone, errorMessage = null, errorStack = null) {
  return {
    operation: 'sync_step',
    endpoint_or_step: step,
    tenant_id: tenantId,
    status,
    duration_ms: durationMs,
    row_count: created + deleted + archived,
    offset,
    page_size: pageSize,
    next_offset: nextOffset,
    is_done: isDone,
    error_message: errorMessage,
    error_stack: errorStack,
  };
}

// Async helper to persist log entry to SyncLog entity
export async function persistLog(serviceRole, logData) {
  try {
    await serviceRole.entities.SyncLog.create({
      ...logData,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    // Silent fail — log persistence should not block operations
    console.warn('[SyncLog] Entity write failed:', err.message);
  }
}