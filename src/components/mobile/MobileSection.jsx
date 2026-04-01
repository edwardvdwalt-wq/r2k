import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * MobileSection - Collapsible section card
 * Used for grouping related info (Overview, Hazards, Supplier, etc.)
 */
export default function MobileSection({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
  badge = null,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={cn(
      "border border-border rounded-lg overflow-hidden",
      "bg-card hover:border-primary/30 transition-colors",
      className
    )}>
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 md:py-4 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {Icon && <Icon size={20} className="shrink-0 text-primary" />}
          <h3 className="font-semibold text-base md:text-lg text-left">{title}</h3>
          {badge && <div className="ml-auto shrink-0">{badge}</div>}
        </div>
        <ChevronDown 
          size={20} 
          className={cn(
            "shrink-0 text-muted-foreground transition-transform",
            !isOpen && "-rotate-90"
          )}
        />
      </button>

      {/* Content */}
      {isOpen && (
        <div className="px-4 py-3 md:px-4 md:py-4 border-t border-border text-sm space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}