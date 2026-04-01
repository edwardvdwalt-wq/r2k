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
  const completedAt = timelineEvent?.completed_at || timelineEvent?.created_at;

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
  const { tenantId, isSyncLocked } = useTenant();

  const [loading, setLoading] = useState(true);
  const [syncMode, setSyncMode] = useState('incremental');
  const [syncStateId, setSyncStateId] = useState(null);
  const [updatingMode, setUpdatingMode] = useState(false);

  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [purgeRunning, setPurgeRunning] = useState(false);
  const [purgeComplete, setPurgeComplete] = useState(true); // true = no purge in progress, safe to sync
  const [syncError, setSyncError] = useState(null);

  // Timeline events keyed by step name — populated from SyncLog
  const [stepEvents, setStepEvents] = useState({});
  const [pipelineEvent, setPipelineEvent] = useState(null); // pipeline_started / completed / failed

  // Live entity counts — sourced directly from Base44 entity tables
  const [liveCounts, setLiveCounts] = useState(null);
  const [liveCountsLoading, setLiveCountsLoading] = useState(false);
  const [liveCountsTs, setLiveCountsTs] = useState(null);

  // Load current SyncState once on mount
  useEffect(() => {
    if (!tenantId) return;
    const load = async () => {
      try {
        const syncKey = `tenant:${tenantId}:registry`;
        const raw = await base44.entities.SyncState.filter({ sync_key: syncKey });
        const arr = Array.isArray(raw) ? raw : (raw?.data || []);
        if (arr.length > 0) {
          setSyncMode(arr[0].requested_mode || 'incremental');
          setSyncStateId(arr[0].id);
        }
      } catch (e) {
        console.error('SyncMonitor: failed to load SyncState:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tenantId]);

  // Load the most recent pipeline run's timeline from SyncLog
  const loadTimeline = useCallback(async () => {
    if (!tenantId) return;
    // Clear stale data before fetching fresh timeline
    setStepEvents({});
    setPipelineEvent(null);
    setSyncError(null);
    try {
      console.log('[SyncMonitor] loadTimeline called');
      // Get the last 50 timeline events for this tenant
      const raw = await base44.entities.SyncLog.filter(
        { operation: 'sync_timeline', tenant_id: tenantId },
        '-created_date', 50
      );
      const entries = Array.isArray(raw) ? raw : (raw?.data || []);
      if (entries.length === 0) return;

      // Find the most recent pipeline_started to scope to current run only
      // (entries are in desc order: newest first)
      const currentPipelineStart = entries.find(e => e.endpoint_or_step === 'pipeline_started');
      if (!currentPipelineStart) return; // No active or recent run
      
      const currentRunId = currentPipelineStart.sync_run_id;
      
      // Include only events from this run using sync_run_id
      const runEntries = entries.filter(e => e.sync_run_id === currentRunId);

      const newStepEvents = {};
      let newPipelineEvent = null;
      const seenSteps = new Set(); // Track which steps we've already processed

      runEntries.forEach(entry => {
        const ep = entry.endpoint_or_step;
        if (ep === 'pipeline_started' || ep === 'pipeline_completed' || ep === 'pipeline_failed' || ep === 'pipeline_tenant_steps_completed') {
          if (ep === 'pipeline_completed') newPipelineEvent = { ...entry, status: 'success' };
          else if (ep === 'pipeline_failed') newPipelineEvent = { ...entry, status: 'error' };
          else if (ep === 'pipeline_started') {
            // Only show as "running" if recent (within 10 min), else treat as stale
            const eventTime = new Date(entry.created_at).getTime();
            const isRecent = (Date.now() - eventTime) < 10 * 60 * 1000;
            if (!newPipelineEvent && isRecent) newPipelineEvent = { ...entry, status: 'running' };
          }
          return;
        }

        // Parse step name from event like "registry_completed", "registry_started", "registry_failed", "registry_skipped"
        const match = ep.match(/^(.+)_(started|completed|failed|skipped)$/);
        if (!match) return;
        const [, stepKey, eventType] = match;

        // Skip if we've already processed a terminal event for this step
        if (seenSteps.has(stepKey)) return;

        // Terminal events take priority
        if (eventType === 'completed') {
          newStepEvents[stepKey] = { ...entry, status: 'success' };
          seenSteps.add(stepKey);
        } else if (eventType === 'failed') {
          newStepEvents[stepKey] = { ...entry, status: 'error' };
          seenSteps.add(stepKey);
        } else if (eventType === 'skipped') {
          newStepEvents[stepKey] = { ...entry, status: 'skipped' };
          seenSteps.add(stepKey);
        } else if (eventType === 'started') {
          // Only set to running if no terminal event exists
          if (!newStepEvents[stepKey]) {
            newStepEvents[stepKey] = { ...entry, status: 'running' };
          }
        }
      });

      setStepEvents(newStepEvents);
      setPipelineEvent(newPipelineEvent);
      // Clear error if no current failure
      if (!newPipelineEvent || newPipelineEvent.status !== 'error') setSyncError(null);
    } catch (e) {
      console.error('SyncMonitor: failed to load timeline:', e);
    }
  }, [tenantId]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  const [lastCountsRefresh, setLastCountsRefresh] = useState(0);
  
  const loadLiveCounts = useCallback(async (force = false) => {
    if (!tenantId) return;
    const now = Date.now();
    if (!force && now - lastCountsRefresh < 5000) return; // Debounce: min 5s between calls
    
    console.log('[SyncMonitor] loadLiveCounts called, force=', force);
    setLastCountsRefresh(now);
    setLiveCountsLoading(true);
    try {
      const res = await base44.functions.invoke('getEntityCounts', { tenant_id: tenantId });
      const data = res?.data;
      setLiveCounts(data);
      setLiveCountsTs(data?.timestamp ? new Date(data.timestamp) : new Date());
      console.log('[SyncMonitor] Entity counts loaded:', data);
    } catch (e) {
      console.error('SyncMonitor: failed to load live counts:', e);
    } finally {
      setLiveCountsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadLiveCounts();
  }, [loadLiveCounts]);

  const handleModeToggle = async (newMode) => {
    if (!syncStateId) return;
    setUpdatingMode(true);
    try {
      await base44.entities.SyncState.update(syncStateId, { requested_mode: newMode });
      setSyncMode(newMode);
    } catch (e) {
      console.error('Failed to update sync mode:', e);
    } finally {
      setUpdatingMode(false);
    }
  };

  const handleIncrementalSync = async () => {
    setPipelineRunning(true);
    setSyncError(null);
    setStepEvents({});
    setPipelineEvent({ status: 'running' });

    try {
      const res = await base44.functions.invoke('orchestrateTenantSync', {
        site_parent: tenantId,
        force: false,
      });

      const data = res?.data;
      setPipelineEvent({
        status: 'success',
        duration_ms: data?.duration_ms || null,
      });

      await loadTimeline();
      await loadLiveCounts(true);
    } catch (e) {
      setSyncError(e.message);
      setPipelineEvent({ status: 'error', error_message: e.message });
      await loadTimeline();
    } finally {
      setPipelineRunning(false);
    }
  };

  const handleForceResync = async () => {
    if (!confirm('⚠️ This will force resync ALL data. This may take several minutes. Continue?')) return;

    setPipelineRunning(true);
    setSyncError(null);
    setStepEvents({});
    setPipelineEvent({ status: 'running' });

    try {
      const res = await base44.functions.invoke('orchestrateTenantSync', {
        site_parent: tenantId,
        force: true,
      });

      const data = res?.data;
      setPipelineEvent({
        status: 'success',
        duration_ms: data?.duration_ms || null,
      });

      await loadTimeline();
      await loadLiveCounts(true);
    } catch (e) {
      setSyncError(e.message);
      setPipelineEvent({ status: 'error', error_message: e.message });
      await loadTimeline();
    } finally {
      setPipelineRunning(false);
    }
  };

  const [purgeStatus, setPurgeStatus] = useState('');
  const [killingProcess, setKillingProcess] = useState(false);

  const handlePurgeData = async () => {
    if (!confirm('⚠️ This will DELETE all synced data for this tenant. Run this BEFORE a Force Resync when data counts are wrong. Continue?')) return;
    setPurgeRunning(true);
    setPurgeComplete(false);
    setSyncError(null);
    setPurgeStatus('Purge started server-side…');

    try {
      // Synchronous — waits until purge is fully complete on the backend
      setPurgeStatus('Purging all tenant data… this may take several minutes. Please wait.');
      await base44.functions.invoke('purgeTenantEntities', { tenant_id: tenantId });

      setPurgeComplete(true);
      setPurgeStatus('✅ Purge complete. You may now run Force Resync.');
      await loadLiveCounts();
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
      // Expected to error since process exits
      console.log('Process kill initiated:', e.message);
    } finally {
      setKillingProcess(false);
      await new Promise(r => setTimeout(r, 1000));
      await loadTimeline();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const completedCount = ALL_STEPS.filter(s => stepEvents[s.key]?.status === 'success').length;
  const runningCount = ALL_STEPS.filter(s => stepEvents[s.key]?.status === 'running').length;
  const errorCount = ALL_STEPS.filter(s => stepEvents[s.key]?.status === 'error').length;

  const pipelineStatus = pipelineEvent?.status;

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
          {syncMode === 'incremental' && (
            <Button
              size="sm"
              disabled={pipelineRunning || purgeRunning || isSyncLocked}
              onClick={handleIncrementalSync}
            >
              {pipelineRunning || isSyncLocked
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Syncing…</>
                : <><RefreshCw className="w-4 h-4 mr-2" /> Sync Now</>
              }
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={purgeRunning || pipelineRunning || isSyncLocked || !liveCounts || (liveCounts.tenant && Object.values(liveCounts.tenant).every(v => v === 0)) && (liveCounts.lookups && Object.values(liveCounts.lookups).every(v => v === 0))}
            onClick={handlePurgeData}
            className="border-orange-300 text-orange-700 hover:bg-orange-50"
            title={isSyncLocked ? 'Sync is active — wait for it to complete before purging' : liveCounts && (liveCounts.tenant && Object.values(liveCounts.tenant).every(v => v === 0)) && (liveCounts.lookups && Object.values(liveCounts.lookups).every(v => v === 0)) ? "No data to purge" : undefined}
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
          {syncMode === 'full' && liveCounts && (liveCounts.tenant && Object.values(liveCounts.tenant).every(v => v === 0)) && (liveCounts.lookups && Object.values(liveCounts.lookups).every(v => v === 0)) && (
            <Button
              variant="destructive"
              size="sm"
              disabled={pipelineRunning || purgeRunning || !purgeComplete || isSyncLocked}
              onClick={handleForceResync}
              title={!purgeComplete ? 'Waiting for purge to complete before syncing…' : undefined}
            >
              {pipelineRunning
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running…</>
                : <><Play className="w-4 h-4 mr-2" /> Force Resync All</>
              }
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => { loadTimeline(); loadLiveCounts(true); }} title="Refresh counts immediately">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {/* Error */}
      {syncError && (
        <div className="bg-destructive/10 border border-destructive rounded-lg p-4">
          <p className="text-destructive font-semibold text-sm">Pipeline Error:</p>
          <p className="text-sm text-destructive/90 mt-1">{syncError}</p>
        </div>
      )}

      {/* Pipeline status banner */}
      {pipelineEvent && (
        <div className={`rounded-lg px-4 py-3 flex items-center gap-3 border ${
          pipelineStatus === 'success' ? 'bg-green-50 border-green-200' :
          pipelineStatus === 'error'   ? 'bg-red-50 border-red-200' :
          pipelineStatus === 'running' ? 'bg-blue-50 border-blue-200' :
          'bg-gray-50 border-gray-200'
        }`}>
          {pipelineStatus === 'running' && <Loader2 className="w-4 h-4 text-blue-600 animate-spin flex-shrink-0" />}
          {pipelineStatus === 'success' && <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />}
          {pipelineStatus === 'error'   && <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />}
          <span className="text-sm font-medium">
            {pipelineStatus === 'running' ? 'Pipeline running server-side…' :
             pipelineStatus === 'success' ? `Pipeline completed${pipelineEvent.duration_ms ? ` in ${(pipelineEvent.duration_ms / 1000).toFixed(1)}s` : ''}` :
             pipelineStatus === 'error'   ? `Pipeline failed: ${pipelineEvent.error_message || 'unknown error'}` : ''}
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
            <span className="text-xs text-gray-400 font-normal">
              {liveCountsTs ? `as of ${liveCountsTs.toLocaleTimeString()}` : ''}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={loadLiveCounts} disabled={liveCountsLoading}>
            {liveCountsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          </Button>
        </CardHeader>
        <CardContent>
          {liveCountsLoading && !liveCounts ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Querying entity tables…
            </div>
          ) : liveCounts ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tenant: {tenantId}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {Object.entries(liveCounts.tenant || {}).map(([key, val]) => (
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
                  {Object.entries(liveCounts.lookups || {}).map(([key, val]) => (
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