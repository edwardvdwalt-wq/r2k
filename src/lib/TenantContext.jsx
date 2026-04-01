import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isMobilePlatform } from '@/lib/platformDetect';
import { runMobileSync, hasCachedData, clearAllCache } from '@/lib/mobileSync';
import { queryClientInstance } from '@/lib/query-client';
import { loadTimelineEntries, resolveCurrentPipeline } from '@/lib/syncTimeline';

const TenantContext = createContext(null);

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** Returns true if any numeric value in obj is greater than zero */
const hasNonZeroValues = (obj) =>
  obj != null && Object.values(obj).some(v => typeof v === 'number' && v > 0);

/**
 * Resolve the active lock from an array of lock rows.
 * Picks the newest row by heartbeat_at > started_at > created_at,
 * then checks if it is still within the 5-minute activity window.
 */
const resolveLatestLock = (rows) => {
  if (!rows || rows.length === 0) return { lock: null, active: false };
  const sorted = [...rows].sort((a, b) => {
    const tsA = new Date(a.heartbeat_at || a.started_at || a.created_date || 0).getTime();
    const tsB = new Date(b.heartbeat_at || b.started_at || b.created_date || 0).getTime();
    return tsB - tsA; // newest first
  });
  const lock = sorted[0];
  if (lock.status !== 'in_progress') return { lock, active: false };
  const ts = new Date(lock.heartbeat_at || lock.started_at || lock.created_date || 0).getTime();
  const active = ts > 0 && (Date.now() - ts) < 5 * 60 * 1000;
  return { lock, active };
};

// resolveCurrentPipeline is imported from lib/syncTimeline.js

/**
 * Pure function — computes full-sync eligibility from discrete inputs.
 * Precedence: running → locked → wrong mode → has data → ok
 */
const computeFullSyncEligibility = ({ syncMode, syncStatus, isSyncLocked, entityCounts }) => {
  const running = syncStatus === 'syncing';
  const hasData = hasNonZeroValues(entityCounts?.tenant) || hasNonZeroValues(entityCounts?.lookups);
  const countsLoaded = entityCounts !== null;

  if (running)             return { canRunFullSync: false, fullSyncBlockedReason: 'Sync currently running' };
  if (isSyncLocked)        return { canRunFullSync: false, fullSyncBlockedReason: 'Tenant sync lock is active' };
  if (syncMode !== 'full') return { canRunFullSync: false, fullSyncBlockedReason: 'Sync mode is not set to full' };
  if (hasData)             return { canRunFullSync: false, fullSyncBlockedReason: 'Existing tenant or lookup data must be purged before full sync' };
  if (!countsLoaded)       return { canRunFullSync: false, fullSyncBlockedReason: 'Entity counts not yet loaded' };
  return { canRunFullSync: true, fullSyncBlockedReason: '' };
};

// ── Provider ──────────────────────────────────────────────────────────────────

export function TenantProvider({ children }) {
  const { user } = useAuth();
  const [tenant, setTenant] = useState(null);
  const [tenantUser, setTenantUser] = useState(null);
  const [allTenants, setAllTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSite, setActiveSite] = useState(null);

  // Sync trigger status (local UI state for ongoing invocations)
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'syncing' | 'done' | 'error'
  const [syncMessage, setSyncMessage] = useState('');
  const [syncPercent, setSyncPercent] = useState(0);
  const [syncError, setSyncError] = useState(null);

  // Lock & mode (sourced from SyncState)
  const [isSyncLocked, setIsSyncLocked] = useState(false);
  const [syncMode, setSyncMode] = useState(null); // 'incremental' | 'full' | null
  const [syncStateId, setSyncStateId] = useState(null);

  // Entity counts
  const [entityCounts, setEntityCounts] = useState(null);
  const [entityCountsLoading, setEntityCountsLoading] = useState(false);
  const [entityCountsError, setEntityCountsError] = useState(null);

  // Pipeline status (sourced from SyncLog timeline)
  const [pipelineStatus, setPipelineStatus] = useState('idle'); // 'idle'|'running'|'success'|'error'
  const [currentSyncRunId, setCurrentSyncRunId] = useState(null);
  const [currentStep, setCurrentStep] = useState(null);
  const [lastPipelineCompletedAt, setLastPipelineCompletedAt] = useState(null);

  // Mobile
  const [mobileSyncReady, setMobileSyncReady] = useState(!isMobilePlatform());

  const syncInProgressRef = useRef(false);
  const lockConflictTimerRef = useRef(null);
  const lockPollRef = useRef(null);
  const tenantRef = useRef(tenant);

  useEffect(() => { tenantRef.current = tenant; }, [tenant]);

  const isSuperAdmin = user?.role === 'admin';
  const hazmatRole = isSuperAdmin
    ? 'app_super_admin'
    : (user?.hazmat_role || tenantUser?.tenant_role || 'site_user');

  // ── Tenant loading ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    loadTenantData();
  }, [user]);

  const loadTenantData = async () => {
    setLoading(true);
    try {
      if (isSuperAdmin) {
        const tenants = await base44.entities.Tenant.list();
        setAllTenants(tenants);
        const storedId = localStorage.getItem('hazmat_active_tenant');
        const active = tenants.find(t => t.id === storedId) || tenants[0];
        setTenant(active || null);
      } else {
        const [tenantRes, tuRows] = await Promise.all([
          user.tenant_id
            ? base44.entities.Tenant.filter({ id: user.tenant_id })
            : Promise.resolve([]),
          base44.entities.TenantUser.filter({ user_email: user.email })
        ]);
        const [t] = tenantRes;
        setTenant(t || null);
        setTenantUser(tuRows[0] || null);
      }
    } catch (e) {
      console.error('Failed to load tenant data:', e);
    } finally {
      setLoading(false);
    }
  };

  // ── Individual loaders ────────────────────────────────────────────────────

  const loadSyncMode = useCallback(async (siteParent) => {
    if (!siteParent) return;
    try {
      const syncKey = `tenant:${siteParent}:registry`;
      const raw = await base44.entities.SyncState.filter({ sync_key: syncKey });
      const arr = Array.isArray(raw) ? raw : (raw?.data || []);
      if (arr.length > 0) {
        setSyncMode(arr[0].requested_mode || null);
        setSyncStateId(arr[0].id);
      }
    } catch (_) {}
  }, []);

  const loadEntityCounts = useCallback(async (siteParent) => {
    if (!siteParent) return;
    setEntityCountsLoading(true);
    setEntityCountsError(null);
    try {
      const res = await base44.functions.invoke('getEntityCounts', { tenant_id: siteParent });
      const data = res?.data;
      if (data) setEntityCounts(data);
    } catch (e) {
      setEntityCountsError(e.message);
    } finally {
      setEntityCountsLoading(false);
    }
  }, []);

  const loadPipelineStatus = useCallback(async (siteParent) => {
    if (!siteParent) return;
    try {
      const entries = await loadTimelineEntries(base44.entities, siteParent);
      const resolved = resolveCurrentPipeline(entries);
      setPipelineStatus(resolved.pipelineStatus);
      setCurrentSyncRunId(resolved.currentSyncRunId);
      setCurrentStep(resolved.currentStep);
      setLastPipelineCompletedAt(resolved.lastPipelineCompletedAt);
    } catch (_) {}
  }, []);

  const checkLock = useCallback(async (siteParent) => {
    if (!siteParent) return;
    try {
      const raw = await base44.entities.SyncState.filter({ sync_key: `lock:tenant:${siteParent}:sync` });
      const rows = Array.isArray(raw) ? raw : (raw?.data || []);
      const { active } = resolveLatestLock(rows);
      setIsSyncLocked(active);
    } catch (_) {}
  }, []);

  // ── Unified refresh ───────────────────────────────────────────────────────

  /**
   * refreshSyncState — single entry point for all sync UI state.
   * Loads mode, entity counts, pipeline timeline, and lock in parallel.
   */
  const refreshSyncState = useCallback(async (siteParent) => {
    const sp = siteParent || tenantRef.current?.site_parent;
    if (!sp) return;
    await Promise.all([
      loadSyncMode(sp),
      loadEntityCounts(sp),
      loadPipelineStatus(sp),
      checkLock(sp),
    ]);
  }, [loadSyncMode, loadEntityCounts, loadPipelineStatus, checkLock]);

  // Keep backward-compat alias used by SyncMonitor and Dashboard
  const refreshSyncEligibility = refreshSyncState;

  // ── Update sync mode ──────────────────────────────────────────────────────
  const updateSyncMode = useCallback(async (newMode) => {
    if (!syncStateId) return;
    try {
      await base44.entities.SyncState.update(syncStateId, { requested_mode: newMode });
      setSyncMode(newMode);
      const sp = tenantRef.current?.site_parent;
      if (sp) await Promise.all([loadSyncMode(sp), loadEntityCounts(sp)]);
    } catch (e) {
      console.error('[TenantContext] Failed to update sync mode:', e);
      throw e;
    }
  }, [syncStateId, loadSyncMode, loadEntityCounts]);

  // ── Tenant change effect: load all state + start lock poll ────────────────
  useEffect(() => {
    const siteParent = tenant?.site_parent;
    if (!siteParent) return;
    refreshSyncState(siteParent);
    lockPollRef.current = setInterval(() => checkLock(siteParent), 10000);
    return () => clearInterval(lockPollRef.current);
  }, [tenant?.site_parent, refreshSyncState, checkLock]);

  // ── Sync trigger ──────────────────────────────────────────────────────────
  const triggerSync = useCallback(async (siteParent, force = false) => {
    if (lockConflictTimerRef.current) {
      console.log('[TenantContext] Sync blocked — lock conflict cooldown active');
      return;
    }
    if (syncInProgressRef.current) return;
    if (!navigator.onLine) return;

    syncInProgressRef.current = true;
    setIsSyncLocked(true);
    setSyncStatus('syncing');
    setSyncError(null);
    setSyncMessage('Syncing…');
    setSyncPercent(0);

    try {
      console.log(`[TenantContext] Triggering backend sync for ${siteParent} (force=${force})`);
      await base44.functions.invoke('orchestrateTenantSync', { site_parent: siteParent, force });
      setSyncStatus('done');
      setSyncMessage('');
      setSyncPercent(100);
      queryClientInstance.invalidateQueries();
    } catch (e) {
      console.error('[TenantContext] Sync failed:', e);
      if (e?.status === 409 || e?.message?.includes('already running') || e?.message?.toLowerCase().includes('sync already')) {
        setSyncStatus('idle');
        setSyncMessage('');
        setSyncPercent(0);
        setSyncError(null);
        clearTimeout(lockConflictTimerRef.current);
        lockConflictTimerRef.current = setTimeout(() => {
          lockConflictTimerRef.current = null;
        }, 30000);
      } else {
        setSyncStatus('error');
        setSyncMessage('Sync failed');
        setSyncError(e.message);
        setTimeout(() => {
          setSyncStatus('idle');
          setSyncMessage('');
          setSyncError(null);
        }, 30000);
      }
    } finally {
      syncInProgressRef.current = false;
      const sp = tenantRef.current?.site_parent;
      if (sp) setTimeout(() => refreshSyncState(sp), 1000);
    }
  }, [refreshSyncState]);

  // ── Mobile sync ───────────────────────────────────────────────────────────
  const triggerMobileSync = useCallback(async (tenantId) => {
    if (!navigator.onLine) {
      const cached = await hasCachedData(tenantId);
      if (cached) { setMobileSyncReady(true); return; }
      setSyncError('No internet connection. Connect to complete the initial sync.');
      return;
    }
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      await runMobileSync(tenantId, (msg, pct) => { setSyncMessage(msg); setSyncPercent(pct); });
      setSyncStatus('done');
      setSyncMessage('');
      setSyncPercent(100);
      queryClientInstance.invalidateQueries();
      setTimeout(() => setMobileSyncReady(true), 800);
    } catch (e) {
      console.error('[MobileSync] failed:', e);
      const cached = await hasCachedData(tenantId);
      if (cached) {
        setSyncStatus('done');
        setSyncMessage('Sync failed - using cached data.');
        setSyncPercent(100);
        setSyncError(null);
        setTimeout(() => setMobileSyncReady(true), 800);
      } else {
        setSyncStatus('error');
        setSyncError('Sync failed: ' + e.message);
        setMobileSyncReady(true);
      }
    }
  }, []);

  // ── Stable wrappers (no deps — always use tenantRef) ──────────────────────
  const stableTriggerSync = useCallback((force = false) => {
    triggerSync(tenantRef.current?.site_parent, force);
  }, [triggerSync]);

  const stableTriggerMobileSync = useCallback(() => {
    triggerMobileSync(tenantRef.current?.site_parent);
  }, [triggerMobileSync]);

  const stableRefreshSyncState = useCallback(() => {
    refreshSyncState(tenantRef.current?.site_parent);
  }, [refreshSyncState]);

  // ── Tenant switch ─────────────────────────────────────────────────────────
  const switchTenant = useCallback((t) => {
    setEntityCounts(null);
    setPipelineStatus('idle');
    setCurrentSyncRunId(null);
    setCurrentStep(null);
    setLastPipelineCompletedAt(null);
    setTenant(t);
    setActiveSite(null);
    localStorage.setItem('hazmat_active_tenant', t.id);
    setTimeout(() => refreshSyncState(t.site_parent), 0);
  }, [refreshSyncState]);

  const switchSite = useCallback((siteName) => setActiveSite(siteName), []);

  const resyncFromScratch = useCallback(async () => {
    clearTimeout(lockConflictTimerRef.current);
    lockConflictTimerRef.current = null;
    await clearAllCache();
    queryClientInstance.clear();
    const sp = tenantRef.current?.site_parent;
    if (isMobilePlatform()) {
      setMobileSyncReady(false);
      triggerMobileSync(sp);
    } else {
      triggerSync(sp, true);
    }
    setTimeout(() => {
      refreshSyncState(sp);
      window.location.reload();
    }, 500);
  }, [triggerSync, triggerMobileSync, refreshSyncState]);

  // ── Derived sync safety flags ─────────────────────────────────────────────
  const pipelineRunning = syncStatus === 'syncing';
  const canRunIncrementalSync = syncMode === 'incremental' && !isSyncLocked && !pipelineRunning;
  const canRunPurge = syncMode === 'full' && !isSyncLocked && !pipelineRunning;
  const { canRunFullSync, fullSyncBlockedReason } = computeFullSyncEligibility({
    syncMode, syncStatus, isSyncLocked, entityCounts,
  });

  // ── Context value ─────────────────────────────────────────────────────────
  const value = useMemo(() => ({
    // Tenant
    tenant,
    tenantUser,
    allTenants,
    loading,
    switchTenant,
    switchSite,
    activeSite,
    tenantId: tenant?.site_parent || null,
    hazmatRole,
    tenantRole: hazmatRole,
    canEdit: ['app_super_admin', 'site_admin'].includes(hazmatRole),
    isSuperAdmin,
    // Sync trigger status
    syncStatus,
    syncMessage,
    syncPercent,
    syncError,
    // Lock & mode
    isSyncLocked,
    syncMode,
    syncStateId,
    // Entity counts
    entityCounts,
    liveCounts: entityCounts, // backward-compat alias
    entityCountsLoading,
    entityCountsError,
    // Pipeline state (from SyncLog)
    pipelineStatus,
    currentSyncRunId,
    currentStep,
    lastPipelineCompletedAt,
    // Eligibility flags
    canRunIncrementalSync,
    canRunFullSync,
    canRunPurge,
    fullSyncBlockedReason,
    // Mobile
    mobileSyncReady,
    isMobile: isMobilePlatform(),
    // Actions
    triggerSync: stableTriggerSync,
    retryMobileSync: stableTriggerMobileSync,
    resyncFromScratch,
    updateSyncMode,
    refreshSyncState: stableRefreshSyncState,
    refreshSyncEligibility: stableRefreshSyncState, // backward-compat alias
  }), [
    tenant, tenantUser, allTenants, loading, hazmatRole, isSuperAdmin,
    syncStatus, syncMessage, syncPercent, syncError,
    isSyncLocked, syncMode, syncStateId,
    entityCounts, entityCountsLoading, entityCountsError,
    pipelineStatus, currentSyncRunId, currentStep, lastPipelineCompletedAt,
    canRunIncrementalSync, canRunFullSync, canRunPurge, fullSyncBlockedReason,
    mobileSyncReady,
    switchTenant, switchSite, resyncFromScratch, updateSyncMode,
    stableTriggerSync, stableTriggerMobileSync, stableRefreshSyncState,
  ]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export const useTenant = () => {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
};