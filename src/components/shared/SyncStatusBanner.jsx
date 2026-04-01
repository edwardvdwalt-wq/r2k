import { useIsOnline } from '@/lib/useOfflineData';
import { cacheMeta } from '@/lib/offlineCache';
import { useTenant } from '@/lib/TenantContext';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useState } from 'react';

export default function SyncStatusBanner() {
  const online = useIsOnline();
  const { tenantId, syncStatus, syncMessage, triggerSync } = useTenant();
  const meta = tenantId ? cacheMeta(tenantId) : null;
  const [syncCooldown, setSyncCooldown] = useState(false);

  const handleSync = async () => {
    if (syncCooldown) return;
    setSyncCooldown(true);
    triggerSync();
    setTimeout(() => setSyncCooldown(false), 5000); // 5s debounce
  };

  if (!online) {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex items-center gap-2 text-xs text-amber-800">
        <WifiOff size={13} />
        <span className="flex-1">Offline — cached data{meta?.lastSync ? ` (synced ${new Date(meta.lastSync).toLocaleString()})` : ''}</span>
      </div>
    );
  }

  if (syncStatus === 'syncing') {
    return (
      <div className="bg-blue-50 border-b border-blue-200 px-4 py-1.5 flex items-center gap-2 text-xs text-blue-800">
        <RefreshCw size={13} className="animate-spin" />
        <span className="flex-1">{syncMessage || 'Syncing offline data…'}</span>
      </div>
    );
  }

  if (syncStatus === 'error') {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-1.5 flex items-center gap-2 text-xs text-red-800">
        <span className="flex-1">Sync failed — using cached data.</span>
        <button onClick={handleSync} disabled={syncCooldown} className="underline font-medium disabled:opacity-50">Retry</button>
      </div>
    );
  }

  return null;
}