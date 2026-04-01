import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * MobileCard - Full-width card for list items
 * Optimized for touch with large tap target
 */
export default function MobileCard({
  title,
  subtitle,
  description,
  icon,
  badge,
  rightContent,
  onClick,
  className = '',
  style = {},
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left border-2 rounded-lg p-3 md:p-4",
        "hover:shadow-md active:shadow-sm transition-all",
        "flex items-start gap-3 md:gap-4",
        "border-border hover:border-primary/30",
        className
      )}
      style={style}
    >
      {/* Icon / Pictogram */}
      {icon && (
        <div className="shrink-0 w-12 h-12 md:w-16 md:h-16 flex items-center justify-center rounded-lg bg-muted/30">
          {icon}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-base md:text-lg truncate">{title}</h3>
          {badge && <div className="shrink-0">{badge}</div>}
        </div>
        
        {subtitle && (
          <p className="text-xs md:text-sm text-muted-foreground truncate mb-1">{subtitle}</p>
        )}
        
        {description && (
          <p className="text-xs md:text-sm text-muted-foreground line-clamp-2">{description}</p>
        )}
      </div>

      {/* Right content / Chevron */}
      {rightContent ? (
        <div className="shrink-0">{rightContent}</div>
      ) : (
        <ChevronRight size={18} className="shrink-0 text-muted-foreground mt-1" />
      )}
    </button>
  );
}