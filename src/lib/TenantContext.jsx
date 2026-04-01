import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isMobilePlatform } from '@/lib/platformDetect';
import { runMobileSync, hasCachedData, clearAllCache } from '@/lib/mobileSync';
import { queryClientInstance } from '@/lib/query-client';

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const { user } = useAuth();
  const [tenant, setTenant] = useState(null);
  const [tenantUser, setTenantUser] = useState(null);
  const [allTenants, setAllTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSite, setActiveSite] = useState(null);

  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'syncing' | 'done' | 'error'
   const [syncMessage, setSyncMessage] = useState('');
   const [syncPercent, setSyncPercent] = useState(0);
   const [syncError, setSyncError] = useState(null);
   const [isSyncLocked, setIsSyncLocked] = useState(false);
   const syncInProgressRef = useRef(false);
   const lockConflictTimerRef = useRef(null);
   const lockPollRef = useRef(null);

   // Mobile-specific: block UI until first sync is done
   const [mobileSyncReady, setMobileSyncReady] = useState(!isMobilePlatform());

  const isSuperAdmin = user?.role === 'admin';
  const hazmatRole = isSuperAdmin
    ? 'app_super_admin'
    : (user?.hazmat_role || tenantUser?.tenant_role || 'site_user');

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

  // ── Poll server lock state ────────────────────────────────────────────────
  const checkLock = useCallback(async (siteParent) => {
    if (!siteParent) return;
    try {
      const raw = await base44.entities.SyncState.filter({ sync_key: `lock:tenant:${siteParent}:sync` });
      const rows = Array.isArray(raw) ? raw : (raw?.data || []);
      const lock = rows[0];
      if (lock && lock.status === 'in_progress') {
        // Use heartbeat_at exclusively — do NOT fall back to updated_date (auto-refreshes on every DB write)
        const ts = lock.heartbeat_at
          ? new Date(lock.heartbeat_at).getTime()
          : new Date(lock.started_at || lock.created_date || 0).getTime();
        const active = ts > 0 && (Date.now() - ts) < 5 * 60 * 1000;
        setIsSyncLocked(active);
      } else {
        setIsSyncLocked(false);
      }
    } catch (_) {}
  }, []);

  // Poll lock every 5s while tenant is loaded
  useEffect(() => {
    const siteParent = tenant?.site_parent;
    if (!siteParent) return;
    checkLock(siteParent);
    lockPollRef.current = setInterval(() => checkLock(siteParent), 5000);
    return () => clearInterval(lockPollRef.current);
  }, [tenant?.site_parent, checkLock]);

  // ── Backend-owned sync: one call, backend runs everything ─────────────────
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
      // orchestrateTenantSync is synchronous — waits for full pipeline completion.
      // If sync model becomes async (background), update this to use polling instead.
      await base44.functions.invoke('orchestrateTenantSync', { site_parent: siteParent, force });
      setSyncStatus('done');
      setSyncMessage('');
      setSyncPercent(100);
      queryClientInstance.invalidateQueries();
    } catch (e) {
       console.error('[TenantContext] Sync failed:', e);
       if (e?.status === 409 || e?.message?.includes('already running')) {
         // Lock conflict: suppress auto-sync for 30s to avoid hammering the backend
         setSyncStatus('idle');
         setSyncMessage('');
         setSyncPercent(0);
         setSyncError(null);
         clearTimeout(lockConflictTimerRef.current);
         lockConflictTimerRef.current = setTimeout(() => {
           lockConflictTimerRef.current = null;
         }, 30000);
       } else if (e.message?.toLowerCase().includes('already running') || e.message?.toLowerCase().includes('sync already')) {
         // Treat "already running" as a non-error — another process is handling it
         setSyncStatus('idle');
         setSyncMessage('');
         setSyncPercent(0);
         setSyncError(null);
       } else {
         setSyncStatus('error');
         setSyncMessage('Sync failed');
         setSyncError(e.message);
         // Auto-clear the error after 30s so stale errors don't persist across navigation
         setTimeout(() => {
           setSyncStatus('idle');
           setSyncMessage('');
           setSyncError(null);
         }, 30000);
       }
     } finally {
       syncInProgressRef.current = false;
       // Re-check lock from server after sync finishes
       const siteParent = tenantRef.current?.site_parent;
       if (siteParent) setTimeout(() => checkLock(siteParent), 1000);
     }
  }, [checkLock]);

  // ── Mobile sync (IndexedDB) ───────────────────────────────────────────────
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

  // ── Auto-sync disabled ───────────────────────────────────────────────────
    // All syncs must be triggered manually via SyncMonitor or user action.
    // Prevents hammering when conflicts occur.

  const switchTenant = (t) => {
    setTenant(t);
    setActiveSite(null);
    localStorage.setItem('hazmat_active_tenant', t.id);
    // Don't auto-trigger sync when switching tenants in incremental mode.
    // Let data fetches fail gracefully and fall back to cache.
    // User can manually sync via SyncMonitor if needed.
  };

  const switchSite = (siteName) => setActiveSite(siteName);

  // Track tenant in ref to avoid dependencies on tenant object
  const tenantRef = useRef(tenant);
  useEffect(() => {
    tenantRef.current = tenant;
  }, [tenant]);

  const resyncFromScratch = async () => {
    // Manual full resync bypasses lock cooldown
    clearTimeout(lockConflictTimerRef.current);
    lockConflictTimerRef.current = null;
    await clearAllCache();
    queryClientInstance.clear();
    const siteParent = tenantRef.current?.site_parent;
    if (isMobilePlatform()) {
      setMobileSyncReady(false);
      triggerMobileSync(siteParent);
    } else {
      triggerSync(siteParent, true);
    }
    setTimeout(() => window.location.reload(), 500);
  };

  // Stable wrapper functions — no dependencies means they never recreate
  const stableTriggerSync = useCallback((force = false) => {
    triggerSync(tenantRef.current?.site_parent, force);
  }, []);

  const stableTriggerMobileSync = useCallback(() => {
    triggerMobileSync(tenantRef.current?.site_parent);
  }, []);

  // Memoize the entire context value to prevent unnecessary re-renders of subscribers
  const value = useMemo(() => ({
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
    syncStatus,
    syncMessage,
    syncPercent,
    syncError,
    isSyncLocked,
    mobileSyncReady,
    isMobile: isMobilePlatform(),
    triggerSync: stableTriggerSync,
    retryMobileSync: stableTriggerMobileSync,
    resyncFromScratch,
  }), [tenant, tenantUser, allTenants, loading, hazmatRole, isSuperAdmin, syncStatus, syncMessage, syncPercent, syncError, isSyncLocked, mobileSyncReady, switchTenant, switchSite, resyncFromScratch]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export const useTenant = () => {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
};