import { GHS_PICTOGRAMS } from '@/utils/riskColors';

export default function GHSPictogram({ code, size = 'md' }) {
  const info = GHS_PICTOGRAMS[code];
  const dim = size === 'sm' ? 'w-8 h-8 text-lg' : 'w-12 h-12 text-2xl';

  return (
    <div
      className={`${dim} rounded border-2 border-red-500 flex items-center justify-center bg-white`}
      title={info?.label || code}
    >
      <span>{info?.symbol || '⚠️'}</span>
    </div>
  );
}