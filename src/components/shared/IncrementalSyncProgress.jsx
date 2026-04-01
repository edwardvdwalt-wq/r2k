import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function IncrementalSyncProgress() {
  const { tenantId } = useTenant();
  const [currentStep, setCurrentStep] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [syncing, setSyncing] = useState(false);

  // Poll for current sync progress from SyncLog
  useEffect(() => {
    if (!tenantId) return;

    const pollProgress = async () => {
      try {
        // Get the most recent pipeline_started event
        const logs = await base44.entities.SyncLog.filter(
          { operation: 'sync_timeline', tenant_id: tenantId },
          '-created_date',
          1
        );
        const logArr = Array.isArray(logs) ? logs : (logs?.data || []);

        if (logArr.length === 0) {
          setSyncing(false);
          setCurrentStep(null);
          return;
        }

        const latest = logArr[0];
        const ep = latest.endpoint_or_step;

        // Determine if we're currently syncing
        if (ep.includes('pipeline_started')) {
          setSyncing(true);
          setCurrentStep('Pipeline starting…');
        } else if (ep === 'pipeline_completed' || ep === 'pipeline_tenant_steps_completed') {
          setSyncing(false);
          setCurrentStep(null);
          // Update last sync time
          setLastSyncTime(new Date(latest.created_at));
        } else if (ep === 'pipeline_failed') {
          setSyncing(false);
          setCurrentStep(null);
        } else {
          // Parse step name
          const match = ep.match(/^(.+)_(started|completed|failed)$/);
          if (match) {
            const [, stepKey] = match;
            setSyncing(true);
            setCurrentStep(stepKey);
          }
        }
      } catch (e) {
        console.error('Failed to fetch sync progress:', e);
      }
    };

    pollProgress();
    const interval = setInterval(pollProgress, 2000);
    return () => clearInterval(interval);
  }, [tenantId]);

  if (!syncing && !lastSyncTime) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          {syncing && <Loader2 size={16} className="animate-spin text-primary flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            {syncing && (
              <p className="text-sm font-medium text-primary">
                Incremental sync in progress: <span className="font-mono text-xs">{currentStep}</span>
              </p>
            )}
            {lastSyncTime && !syncing && (
              <p className="text-sm text-muted-foreground">
                Last incremental sync: {lastSyncTime.toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}