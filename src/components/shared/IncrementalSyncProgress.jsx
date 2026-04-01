import { useTenant } from '@/lib/TenantContext';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function IncrementalSyncProgress() {
  const { pipelineStatus, currentStep, lastPipelineCompletedAt } = useTenant();

  if (pipelineStatus === 'running') {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Loader2 size={16} className="animate-spin text-primary flex-shrink-0" />
            <p className="text-sm font-medium text-primary">
              {currentStep
                ? <>Incremental sync in progress: <span className="font-mono text-xs">{currentStep}</span></>
                : 'Pipeline running…'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (pipelineStatus === 'success' && lastPipelineCompletedAt) {
    return (
      <Card className="border-border bg-muted/30">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            Last sync completed: {new Date(lastPipelineCompletedAt).toLocaleString()}
          </p>
        </CardContent>
      </Card>
    );
  }

  return null;
}