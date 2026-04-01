export const getRiskColor = (rating) => {
  switch (rating) {
    case 'Low': return 'bg-green-100 text-green-800 border-green-300';
    case 'Medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    case 'High': return 'bg-orange-100 text-orange-800 border-orange-300';
    case 'Critical': return 'bg-red-100 text-red-800 border-red-300';
    default: return 'bg-gray-100 text-gray-600 border-gray-300';
  }
};

export const getRiskDot = (rating) => {
  switch (rating) {
    case 'Low': return 'bg-green-500';
    case 'Medium': return 'bg-yellow-500';
    case 'High': return 'bg-orange-500';
    case 'Critical': return 'bg-red-500';
    default: return 'bg-gray-400';
  }
};

export const NFPA_COLORS = {
  health: '#0000FF',
  flammability: '#FF0000',
  reactivity: '#FFFF00',
  special: '#FFFFFF',
};

export const GHS_PICTOGRAMS = {
  'GHS01': { label: 'Explosive', color: '#FF4444', symbol: '💥' },
  'GHS02': { label: 'Flammable', color: '#FF8800', symbol: '🔥' },
  'GHS03': { label: 'Oxidizer', color: '#FF8800', symbol: '⭕' },
  'GHS04': { label: 'Compressed Gas', color: '#4488FF', symbol: '🫧' },
  'GHS05': { label: 'Corrosive', color: '#884400', symbol: '⚗️' },
  'GHS06': { label: 'Toxic', color: '#000000', symbol: '☠️' },
  'GHS07': { label: 'Harmful', color: '#FF8800', symbol: '⚠️' },
  'GHS08': { label: 'Health Hazard', color: '#FF4444', symbol: '🫀' },
  'GHS09': { label: 'Environmental', color: '#008800', symbol: '🌿' },
};