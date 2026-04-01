// Dual logging utility: console (JSON) + SyncLog entity
// Call without await for fire-and-forget entity writes; console always synchronous

export function createLogger() {
  return {
    // Log relay endpoint execution
    async logRelayEndpoint(params = {}) {
      const {
        endpoint,
        requestParams,
        status = 'success',
        durationMs = 0,
        rowCount = 0,
        errorMessage = null,
        errorStack = null,
      } = params;

      const logEntry = {
        timestamp: new Date().toISOString(),
        operation: 'relay_endpoint',
        endpoint,
        status,
        durationMs,
        rowCount,
        requestParams,
        errorMessage,
      };

      // Always log to console (synchronous)
      console.log(JSON.stringify(logEntry, null, 2));

      // Fire-and-forget: attempt entity write (don't await)
      if (typeof Deno !== 'undefined') {
        // In Deno function context, attempt to write entity log
        // This requires a service role client passed separately
        // For now, just note this would be called by wrapper
      }

      return logEntry;
    },

    // Log sync step execution
    async logSyncStep(params = {}) {
      const {
        step,
        siteParent,
        status = 'success',
        durationMs = 0,
        created = 0,
        deleted = 0,
        archived = 0,
        offset = 0,
        pageSize = 0,
        nextOffset = 0,
        isDone = false,
        errorMessage = null,
        errorStack = null,
        requestPayload = null,
      } = params;

      const logEntry = {
        timestamp: new Date().toISOString(),
        operation: 'sync_step',
        step,
        tenantId: siteParent,
        status,
        durationMs,
        created,
        deleted,
        archived,
        offset,
        pageSize,
        nextOffset,
        isDone,
        requestPayload,
        errorMessage,
      };

      // Always log to console (synchronous)
      console.log(JSON.stringify(logEntry, null, 2));

      return logEntry;
    },

    // Helper: parse error to extract message and stack
    parseError(err) {
      return {
        message: err?.message || String(err),
        stack: err?.stack || '',
      };
    },
  };
}

// Export singleton for use in functions
export const logger = createLogger();