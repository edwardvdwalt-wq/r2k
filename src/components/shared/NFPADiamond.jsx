export default function NFPADiamond({ health = 0, flammability = 0, reactivity = 0, special = '' }) {
  const size = 80;
  const center = size / 2;
  const half = size / 2;

  const sections = [
    { label: 'H', value: health, color: '#1a56ff', x: center, y: center - half * 0.45, textColor: '#fff' },
    { label: 'F', value: flammability, color: '#ef4444', x: center + half * 0.45, y: center, textColor: '#fff' },
    { label: 'R', value: reactivity, color: '#eab308', x: center, y: center + half * 0.45, textColor: '#000' },
    { label: 'S', value: special || 'W', color: '#ffffff', x: center - half * 0.45, y: center, textColor: '#000' },
  ];

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="drop-shadow-sm">
        {/* Diamond outline */}
        <polygon
          points={`${center},2 ${size-2},${center} ${center},${size-2} 2,${center}`}
          fill="none"
          stroke="#374151"
          strokeWidth="1.5"
        />
        {/* Health - top (blue) */}
        <polygon
          points={`${center},4 ${size-4},${center} ${center},${center}`}
          fill="#1a56ff"
        />
        {/* Flammability - right (red) */}
        <polygon
          points={`${center},${center} ${size-4},${center} ${center},${size-4}`}
          fill="#ef4444"
        />
        {/* Reactivity - bottom (yellow) */}
        <polygon
          points={`4,${center} ${center},${center} ${center},${size-4}`}
          fill="#eab308"
        />
        {/* Special - left (white) */}
        <polygon
          points={`4,${center} ${center},4 ${center},${center}`}
          fill="#f9fafb"
        />
        {/* Dividers */}
        <line x1={center} y1={4} x2={center} y2={size-4} stroke="#374151" strokeWidth="0.8" />
        <line x1={4} y1={center} x2={size-4} y2={center} stroke="#374151" strokeWidth="0.8" />

        {/* Labels */}
        <text x={center} y={center * 0.52} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="11" fontWeight="bold">{health}</text>
        <text x={center * 1.48} y={center} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="11" fontWeight="bold">{flammability}</text>
        <text x={center} y={center * 1.48} textAnchor="middle" dominantBaseline="middle" fill="#111" fontSize="11" fontWeight="bold">{reactivity}</text>
        <text x={center * 0.52} y={center} textAnchor="middle" dominantBaseline="middle" fill="#111" fontSize="9" fontWeight="bold">{special || 'W'}</text>
      </svg>
      <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-600 inline-block"/>H</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500 inline-block"/>F</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-yellow-400 inline-block"/>R</span>
      </div>
    </div>
  );
}