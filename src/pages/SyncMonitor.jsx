/**
 * SyncMonitor
 *
 * UI for managing and observing synchronization status.
 * Delegates all sync orchestration to orchestrateTenantSync backend function.
 *
 * Responsibilities:
 * - Display current SyncState (mode, status, last completed)
 * - Allow switching sync mode (incremental / full)
 * - Initiate syncs — awaits full completion synchronously
 * - Display per-step timeline and live entity counts (read-only monitoring)
 */

import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { loadTimelineEntries, resolveCurrentPipeline, buildStepSummary } from '@/lib/syncTimeline';
import { RefreshCw, AlertCircle, CheckCircle2, Loader2, Play, Clock, Database, Trash2, Power } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const PIPELINE_STEPS = [
  { key: 'registry',       label: 'Hazmat Registry' },
  { key: 'productMaster',  label: 'Product Master' },
  { key: 'composition',    label: 'Composition' },
  { key: 'hazards',        label: 'Hazards' },
  { key: 'sds',            label: 'SDS Core' },
  { key: 'sites',          label: 'Sites' },
  { key: 'suppliers',      label: 'Suppliers' },
  { key: 'documents',      label: 'Documents' },
];

const LOOKUP_STEPS = [
  { key: 'lookupGhsHazardCodes',   label: 'GHS Codes' },
  { key: 'lookupGhsPictograms',    label: 'GHS Pictograms' },
  { key: 'lookupGhsPrecautionary', label: 'Precautionary Stmts' },
  { key: 'lookupPPE',              label: 'PPE Reference' },
  { key: 'lookupNFPA',             label: 'NFPA Guide' },
  { key: 'lookupGlossary',         label: 'Glossary' },
];

const ALL_STEPS = [...PIPELINE_STEPS, ...LOOKUP_STEPS];

function StepCard({ label, timelineEvent, pipelineRunning }) {
  const status = timelineEvent?.status ?? 'idle';
  const rowCount = timelineEvent?.row_count;
  const duration = timelineEvent?.duration_ms;
  const completedAt = timelineEvent?.completed_at;

  const statusConfig = {
    running: { icon: Loader2, spin: true, color: 'text-blue-600', badge: 'bg-blue-100 text-blue-800', label: 'running' },
    success: { icon: CheckCircle2, spin: false, color: 'text-green-600', badge: 'bg-green-100 text-green-800', label: 'done' },
    error:   { icon: AlertCircle,  spin: false, color: 'text-red-600',   badge: 'bg-red-100 text-red-800',   label: 'error' },
    skipped: { icon: Clock,        spin: false, color: 'text-amber-600', badge: 'bg-amber-100 text-amber-800', label: 'skipped' },
    idle:    { icon: Clock,        spin: false, color: 'text-gray-400',  badge: 'bg-gray-100 text-gray-500', label: 'idle' },
  }[status] || { icon: Clock, spin: false, color: 'text-gray-400', badge: 'bg-gray-100 text-gray-500', label: 'idle' };

  const Icon = statusConfig.icon;

  return (
    <Card className={status === 'running' ? 'border-blue-400 bg-blue-50/50' : ''}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${statusConfig.color} ${statusConfig.spin ? 'animate-spin' : ''}`} />
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{label}</p>
              {status === 'running' && <p className="text-xs text-blue-500 mt-1">In progress…</p>}
              {status === 'success' && (
                <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                  {rowCount != null && <p>Records: <span className="font-medium text-gray-700">{rowCount.toLocaleString()}</span></p>}
                  {duration != null && <p>Duration: <span className="font-medium text-gray-700">{(duration / 1000).toFixed(1)}s</span></p>}
                  {completedAt && <p className="text-gray-400">{new Date(completedAt).toLocaleString()}</p>}
                </div>
              )}
              {status === 'error' && (
                <p className="text-xs text-red-500 mt-1">
                  {timelineEvent?.error_message || 'Step failed'}
                </p>
              )}
              {status === 'skipped' && (
                <p className="text-xs text-amber-600 mt-1">
                  {timelineEvent?.error_message || 'Step skipped'}
                </p>
              )}
            </div>
          </div>
          <Badge className={`text-xs flex-shrink-0 ${statusConfig.badge}`}>
            {statusConfig.label}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SyncMonitor() {
  const {
    tenantId, isSyncLocked,
    syncMode, updateSyncMode,
    entityCounts, entityCountsLoading,
    canRunIncrementalSync, canRunFullSync, canRunPurge, fullSyncBlockedReason,
    pipelineStatus: contextPipelineStatus,
    currentStep: contextCurrentStep,
    lastPipelineCompletedAt,
    refreshSyncState,
  } = useTenant();

  const refreshSyncEligibility = refreshSyncState;

  const [updatingMode, setUpdatingMode] = useState(false);
  const [actionRunning, setActionRunning] = useState(false); // local "waiting for backend" flag only
  const [purgeRunning, setPurgeRunning] = useState(false);
  const [syncError, setSyncError] = useState(null);

  // Step-level timeline keyed by step name — populated from SyncLog via shared helpers
  const [stepEvents, setStepEvents] = useState({});
  // completedDuration is only available immediately after a sync call returns
  const [completedDuration, setCompletedDuration] = useState(null);

  const loadTimeline = useCallback(async () => {
    if (!tenantId) return;
    try {
      const entries = await loadTimelineEntries(base44.entities, tenantId);
      if (entries.length === 0) { setStepEvents({}); return; }

      const { currentSyncRunId } = resolveCurrentPipeline(entries);
      if (currentSyncRunId) {
        setStepEvents(buildStepSummary(entries, currentSyncRunId));
      } else {
        setStepEvents({});
      }
    } catch (e) {
      console.error('SyncMonitor: failed to load timeline:', e);
    }
  }, [tenantId]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);



  const handleModeToggle = async (newMode) => {
    setUpdatingMode(true);
    try {
      await updateSyncMode(newMode);
      await refreshSyncState();
    } catch (e) {
      console.error('Failed to update sync mode:', e);
    } finally {
      setUpdatingMode(false);
    }
  };

  const handleIncrementalSync = async () => {
    setActionRunning(true);
    setSyncError(null);
    setCompletedDuration(null);
    try {
      const res = await base44.functions.invoke('orchestrateTenantSync', { site_parent: tenantId, force: false });
      setCompletedDuration(res?.data?.duration_ms || null);
    } catch (e) {
      setSyncError(e.message);
    } finally {
      setActionRunning(false);
      await loadTimeline();
      await refreshSyncEligibility();
    }
  };

  const handleForceResync = async () => {
    if (!confirm('⚠️ This will force resync ALL data. This may take several minutes. Continue?')) return;
    setActionRunning(true);
    setSyncError(null);
    setCompletedDuration(null);
    try {
      const res = await base44.functions.invoke('orchestrateTenantSync', { site_parent: tenantId, force: true });
      setCompletedDuration(res?.data?.duration_ms || null);
    } catch (e) {
      setSyncError(e.message);
    } finally {
      setActionRunning(false);
      await loadTimeline();
      await refreshSyncEligibility();
    }
  };

  const [purgeStatus, setPurgeStatus] = useState('');
  const [killingProcess, setKillingProcess] = useState(false);

  const handlePurgeData = async () => {
    if (!confirm('⚠️ This will DELETE all synced data for this tenant. Run this BEFORE a Force Resync when data counts are wrong. Continue?')) return;
    setPurgeRunning(true);
    setSyncError(null);
    setPurgeStatus('Purging all tenant data… this may take several minutes. Please wait.');
    try {
      await base44.functions.invoke('purgeTenantEntities', { tenant_id: tenantId });
      setPurgeStatus('✅ Purge complete. You may now run Force Resync.');
      await refreshSyncState();
    } catch (e) {
      setSyncError(e.message);
      setPurgeStatus('');
    } finally {
      setPurgeRunning(false);
    }
  };

  const handleKillProcess = async () => {
    if (!confirm('🛑 This will forcefully stop the running sync process. Continue?')) return;
    setKillingProcess(true);
    try {
      await base44.functions.invoke('killDenoProcess', { tenant_id: tenantId });
    } catch (e) {
      console.log('Process kill initiated:', e.message);
    } finally {
      setKillingProcess(false);
      await new Promise(r => setTimeout(r, 1000));
      await loadTimeline();
      await refreshSyncState();
    }
  };

  // All status is authoritative from TenantContext; actionRunning is only "button is waiting"
  const pipelineStatus = contextPipelineStatus;
  const isBusy = actionRunning || purgeRunning;

  const completedCount = ALL_STEPS.filter(s => stepEvents[s.key]?.status === 'success').length;
  const runningCount = ALL_STEPS.filter(s => stepEvents[s.key]?.status === 'running').length;
  const errorCount = ALL_STEPS.filter(s => stepEvents[s.key]?.status === 'error').length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sync Monitor</h1>
          <p className="text-sm text-gray-500 mt-1">Pipeline runs fully server-side. This page observes status only.</p>

          {/* Sync mode toggle */}
          <div className="flex items-center gap-3 mt-3">
            <span className="text-sm font-medium">Mode:</span>
            <div className="flex gap-1 border rounded-lg p-1 bg-gray-50">
              <button
                onClick={() => handleModeToggle('incremental')}
                disabled={updatingMode}
                className={`px-3 py-1 rounded text-xs font-medium transition ${syncMode === 'incremental' ? 'bg-primary text-white' : 'bg-transparent text-gray-600 hover:bg-gray-100'} disabled:opacity-50`}
              >
                Incremental
              </button>
              <button
                onClick={() => handleModeToggle('full')}
                disabled={updatingMode}
                className={`px-3 py-1 rounded text-xs font-medium transition ${syncMode === 'full' ? 'bg-destructive text-white' : 'bg-transparent text-gray-600 hover:bg-gray-100'} disabled:opacity-50`}
              >
                Full
              </button>
            </div>
            <span className="text-xs text-gray-500 italic">
              {syncMode === 'incremental' ? 'Fetches only changes since last sync' : 'Full resync on next run'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const res = await base44.functions.invoke('checkSyncLocks', { tenant_id: tenantId });
                const data = res.data;
                alert(`Locks: ${data.locked ? '🔒 ACTIVE' : '✅ None'}\n\n${data.message}\n\nFull: ${JSON.stringify(data.lock, null, 2)}`);
              } catch (e) {
                alert(`Error: ${e.message}`);
              }
            }}
          >
            🔍 Check Locks
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!confirm('Clear the sync lock for this tenant? Only use if a sync is stuck.')) return;
              try {
                await base44.functions.invoke('orchestrateTenantSync', {
                  site_parent: tenantId,
                  force_unlock: true,
                });
                loadTimeline();
              } catch (err) {
                console.error('Failed to clear lock:', err.message);
                setSyncError(`Failed to clear lock: ${err.message}`);
              }
            }}
          >
            🔓 Clear Lock
          </Button>
          {canRunIncrementalSync && (
            <Button
              size="sm"
              disabled={isBusy || !canRunIncrementalSync}
              onClick={handleIncrementalSync}
            >
              {actionRunning
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Syncing…</>
                : <><RefreshCw className="w-4 h-4 mr-2" /> Sync Now</>
              }
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={isBusy || !canRunPurge}
            onClick={handlePurgeData}
            className="border-orange-300 text-orange-700 hover:bg-orange-50"
            title={!canRunPurge ? (isSyncLocked ? 'Sync is active — wait for it to complete' : syncMode !== 'full' ? 'Switch to Full mode first' : 'Pipeline is running') : undefined}
          >
            {purgeRunning
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {purgeStatus || 'Purging…'}</>
              : <><Trash2 className="w-4 h-4 mr-2" /> Purge Data</>
            }
          </Button>
          {pipelineStatus === 'running' && (
            <Button
              variant="destructive"
              size="sm"
              disabled={killingProcess}
              onClick={handleKillProcess}
            >
              {killingProcess
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Killing…</>
                : <><Power className="w-4 h-4 mr-2" /> Kill Process</>
              }
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            disabled={isBusy || !canRunFullSync}
            onClick={canRunFullSync ? handleForceResync : undefined}
            title={!canRunFullSync ? fullSyncBlockedReason : undefined}
          >
            {actionRunning
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running…</>
              : <><Play className="w-4 h-4 mr-2" /> Force Resync All</>
            }
          </Button>
          <Button variant="outline" size="sm" onClick={() => { loadTimeline(); refreshSyncEligibility(); }} title="Refresh counts immediately">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {/* Full sync notice */}
      {syncMode === 'full' && !canRunFullSync && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          Full Sync becomes available only after all tenant and lookup data has been purged.
          {fullSyncBlockedReason && <span className="ml-1 text-amber-500">({fullSyncBlockedReason})</span>}
        </div>
      )}

      {/* Error */}
      {syncError && (
        <div className="bg-destructive/10 border border-destructive rounded-lg p-4">
          <p className="text-destructive font-semibold text-sm">Pipeline Error:</p>
          <p className="text-sm text-destructive/90 mt-1">{syncError}</p>
        </div>
      )}

      {/* Pipeline status banner — driven entirely by TenantContext */}
      {pipelineStatus !== 'idle' && (
        <div className={`rounded-lg px-4 py-3 flex items-center gap-3 border ${
          pipelineStatus === 'success' ? 'bg-green-50 border-green-200' :
          pipelineStatus === 'error'   ? 'bg-red-50 border-red-200' :
          'bg-blue-50 border-blue-200'
        }`}>
          {pipelineStatus === 'running' && <Loader2 className="w-4 h-4 text-blue-600 animate-spin flex-shrink-0" />}
          {pipelineStatus === 'success' && <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />}
          {pipelineStatus === 'error'   && <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />}
          <span className="text-sm font-medium">
            {pipelineStatus === 'running'
              ? `Pipeline running server-side${contextCurrentStep ? ` — ${contextCurrentStep}` : '…'}`
              : pipelineStatus === 'success'
              ? `Pipeline completed${completedDuration ? ` in ${(completedDuration / 1000).toFixed(1)}s` : ''}${lastPipelineCompletedAt ? ` · ${new Date(lastPipelineCompletedAt).toLocaleString()}` : ''}`
              : 'Pipeline failed — check timeline for details'}
          </span>
        </div>
      )}

      {/* Overview counters */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Overview</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div><p className="text-xs text-gray-500">Total Steps</p><p className="text-2xl font-bold">{ALL_STEPS.length}</p></div>
            <div><p className="text-xs text-gray-500">Completed</p><p className="text-2xl font-bold text-green-600">{completedCount}</p></div>
            <div><p className="text-xs text-gray-500">Running</p><p className="text-2xl font-bold text-blue-600">{runningCount}</p></div>
            <div><p className="text-xs text-gray-500">Errors</p><p className="text-2xl font-bold text-red-600">{errorCount}</p></div>
          </div>
        </CardContent>
      </Card>

      {/* Live Entity Counts — sourced directly from Base44 entity tables */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm">Live Entity Counts</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={refreshSyncEligibility} disabled={entityCountsLoading}>
            {entityCountsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          </Button>
        </CardHeader>
        <CardContent>
          {entityCountsLoading && !entityCounts ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Querying entity tables…
            </div>
          ) : entityCounts ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tenant: {tenantId}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {Object.entries(entityCounts.tenant || {}).map(([key, val]) => (
                    <div key={key} className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-gray-500 truncate">{key}</p>
                      <p className="text-lg font-bold text-gray-800">{typeof val === 'number' ? val.toLocaleString() : val}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Global Lookups</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(entityCounts.lookups || {}).map(([key, val]) => (
                    <div key={key} className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-gray-500 truncate">{key}</p>
                      <p className="text-lg font-bold text-gray-800">{typeof val === 'number' ? val.toLocaleString() : val}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No count data available.</p>
          )}
        </CardContent>
      </Card>

      {/* Tenant pipeline steps */}
      <div>
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">Tenant Pipeline</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {PIPELINE_STEPS.map(s => (
            <StepCard
              key={s.key}
              label={s.label}
              timelineEvent={stepEvents[s.key]}
              pipelineRunning={pipelineRunning}
            />
          ))}
        </div>
      </div>

      {/* Lookup steps */}
      <div>
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">Reference / Lookup Tables</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {LOOKUP_STEPS.map(s => (
            <StepCard
              key={s.key}
              label={s.label}
              timelineEvent={stepEvents[s.key]}
              pipelineRunning={pipelineRunning}
            />
          ))}
        </div>
      </div>
    </div>
  );
}