import React from 'react';
import { ChevronLeft, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * MobileHeader - Sticky header for mobile screens
 * Shows back button, title, and optional right action
 */
export default function MobileHeader({ 
  title, 
  showBack = true, 
  onBack = null, 
  rightAction = null,
  badge = null,
  className = '' 
}) {
  const navigate = useNavigate();
  
  const handleBack = onBack || (() => navigate(-1));

  return (
    <div className={cn(
      "sticky top-0 z-40 bg-card border-b border-border",
      "px-4 py-3 flex items-center justify-between",
      "md:px-6 md:py-4",
      className
    )}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {showBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="shrink-0 h-9 w-9"
          >
            <ChevronLeft size={20} />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-lg md:text-xl font-semibold truncate">{title}</h1>
          {badge && <div className="text-xs text-muted-foreground mt-0.5">{badge}</div>}
        </div>
      </div>
      
      {rightAction && (
        <div className="shrink-0 ml-2">
          {rightAction}
        </div>
      )}
    </div>
  );
}