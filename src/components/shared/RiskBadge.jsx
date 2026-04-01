import { cn } from '@/lib/utils';
import { getRiskColor } from '@/utils/riskColors';

export default function RiskBadge({ rating, size = 'sm' }) {
  if (!rating) return null;
  return (
    <span className={cn(
      'inline-flex items-center rounded-md border font-semibold',
      getRiskColor(rating),
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
    )}>
      {rating}
    </span>
  );
}