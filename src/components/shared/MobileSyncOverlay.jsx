/**
 * MobileSyncOverlay — shown during initial mobile startup sync.
 * Blocks the UI until the local dataset is ready.
 */
import { Loader2, WifiOff, CheckCircle2 } from 'lucide-react';

export default function MobileSyncOverlay({ message, percent, error, onRetry }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background gap-6 p-8">
      {/* Logo / branding */}
      <div className="flex flex-col items-center gap-2 mb-4">
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
          <span className="text-primary-foreground font-space-grotesk font-bold text-2xl">R2K</span>
        </div>
        <h1 className="text-xl font-bold font-space-grotesk text-foreground">HazMat R2K</h1>
      </div>

      {error ? (
        <>
          <WifiOff className="w-10 h-10 text-destructive" />
          <p className="text-center text-destructive font-medium">{error}</p>
          <p className="text-center text-sm text-muted-foreground">
            Connect to the internet to complete the initial sync, then the app will work offline.
          </p>
          <button
            onClick={onRetry}
            className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </>
      ) : percent >= 100 ? (
        <>
          <CheckCircle2 className="w-10 h-10 text-green-500" />
          <p className="text-center font-medium text-foreground">Dataset ready</p>
        </>
      ) : (
        <>
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <div className="w-full max-w-xs space-y-2">
            <p className="text-center text-sm text-muted-foreground min-h-[20px]">{message}</p>
            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${percent || 0}%` }}
              />
            </div>
            <p className="text-center text-xs text-muted-foreground">{Math.round(percent || 0)}%</p>
          </div>
        </>
      )}
    </div>
  );
}