import React from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * MobileSearchInput - Full-width search optimized for mobile
 * Always visible and easily clearable
 */
export default function MobileSearchInput({
  value,
  onChange,
  onClear,
  placeholder = 'Search materials, suppliers...',
  className = '',
}) {
  return (
    <div className={cn(
      "relative w-full",
      className
    )}>
      <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={cn(
          "w-full pl-10 pr-10 py-3 md:py-2",
          "bg-muted rounded-lg text-base md:text-sm",
          "focus:outline-none focus:ring-2 focus:ring-primary/50",
          "placeholder:text-muted-foreground"
        )}
      />
      {value && (
        <button
          onClick={onClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
}