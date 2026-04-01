import React from 'react';
import { cn } from '@/lib/utils';

/**
 * RiskChip - Color-coded risk badge (matches web styling)
 * Displays short label only, uses consistent web color scheme
 */
export default function RiskChip({ rating, size = 'md' }) {
  const getRiskStyle = (desc) => {
    const d = (desc || '').toLowerCase();
    if (d.includes('extreme') || d.includes('eliminate')) {
      return { colors: 'bg-red-100 text-red-800 border-red-300', label: 'Extreme' };
    }
    if (d.includes('high') || d.includes('proactively')) {
      return { colors: 'bg-orange-100 text-orange-800 border-orange-300', label: 'High' };
    }
    if (d.includes('medium') || d.includes('actively')) {
      return { colors: 'bg-yellow-100 text-yellow-800 border-yellow-300', label: 'Medium' };
    }
    if (d.includes('low') || d.includes('monitor')) {
      return { colors: 'bg-green-100 text-green-800 border-green-300', label: 'Low' };
    }
    return { colors: 'bg-gray-100 text-gray-600 border-gray-300', label: 'Unknown' };
  };

  const style = getRiskStyle(rating);
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs font-semibold',
    lg: 'px-3 py-1.5 text-sm font-semibold',
  };

  return (
    <div className={cn(
      'rounded-md border font-semibold',
      style.colors,
      sizeClasses[size]
    )}>
      {style.label}
    </div>
  );
}