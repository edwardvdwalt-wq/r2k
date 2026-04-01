import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * MobileActionBar - Sticky bottom action bar
 * Ensures primary CTA is always accessible
 */
export default function MobileActionBar({
  primaryAction,
  secondaryAction,
  className = '',
}) {
  return (
    <div className={cn(
      "fixed bottom-0 left-0 right-0 md:hidden",
      "bg-card border-t border-border p-3",
      "flex gap-2 md:pb-0",
      "md:relative md:border-t-0 md:p-0 md:gap-0 md:flex-row-reverse",
      className
    )}>
      {secondaryAction && (
        <div className="flex-1">
          {secondaryAction}
        </div>
      )}
      
      {primaryAction && (
        <div className={secondaryAction ? "flex-1" : "w-full"}>
          {primaryAction}
        </div>
      )}
    </div>
  );
}