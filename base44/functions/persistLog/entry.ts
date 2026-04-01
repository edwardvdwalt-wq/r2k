// Helper function to persist logs to SyncLog entity
// Call this from relay/sync functions with service role client

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

export async function persistSyncLog(base44ServiceRole, logData) {
  try {
    // logData should match SyncLog schema
    await base44ServiceRole.entities.SyncLog.create({
      created_at: new Date().toISOString(),
      ...logData,
    });
  } catch (err) {
    // Silently fail — logging persistence should never block operations
    console.error('[persistLog] Failed to write SyncLog:', err.message);
  }
}

// Wrapper to log to both console and entity
export async function dualLog(base44ServiceRole, logData) {
  // Console log (synchronous)
  console.log(JSON.stringify(logData, null, 2));

  // Entity log (async, fire-and-forget)
  persistSyncLog(base44ServiceRole, logData).catch(() => {});
}