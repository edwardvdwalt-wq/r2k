import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { FlaskConical, WifiOff, Zap, Star } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import { useRBAC } from '@/lib/useRBAC';
import TenantGate from '@/components/shared/TenantGate';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import RiskChip from '@/components/mobile/RiskChip';
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileCard from '@/components/mobile/MobileCard';
import MobileSearchInput from '@/components/mobile/MobileSearchInput';
import MobileBottomNav from '@/components/mobile/MobileBottomNav';
import { useOfflineData } from '@/lib/useOfflineData';
import { getCachedImage } from '@/lib/imageCache';
import { cn } from '@/lib/utils';

function HazMatRegisterInner() {
   const [searchParams] = useSearchParams();
   const [search, setSearch] = useState('');
   const [filterRisks, setFilterRisks] = useState(new Set(['extreme', 'high', 'medium', 'low', 'fast_track']));
   const [filterTop25, setFilterTop25] = useState(false);
   const { tenantId } = useTenant();
   const { canEditRegister } = useRBAC();

    const toggleRiskFilter = (risk) => {
      const newFilters = new Set(filterRisks);
      if (newFilters.has(risk)) {
        newFilters.delete(risk);
      } else {
        newFilters.add(risk);
      }
      setFilterRisks(newFilters);
    };



  const { data: entries, loading: loadingReg, online } = useOfflineData(
    tenantId, 'HazMatRegistry',
    () => base44.entities.HazMatRegistry.filter({ tenant_id: tenantId }, '-created_date', 2000)
  );
  const { data: products } = useOfflineData(
    tenantId, 'ProductMaster',
    () => base44.entities.ProductMaster.filter({ tenant_id: tenantId })
  );
  const { data: hazards } = useOfflineData(
    tenantId, 'Hazard',
    () => base44.entities.Hazard.filter({ tenant_id: tenantId })
  );

  // Deduplicate
  const unique = [...entries.reduce((acc, e) => {
    const key = `${e.file_sha256}|${e.product_name}`;
    const existing = acc.get(key);
    if (!existing || new Date(e.created_date) > new Date(existing.created_date)) {
      acc.set(key, e);
    }
    return acc;
  }, new Map()).values()];

  // Risk sort order: Fast Track=5, Extreme=4, High=3, Medium=2, Low=1, unknown=0
  const riskOrder = (desc) => {
    const d = (desc || '').toLowerCase();
    if (d.includes('fast') || d.includes('security')) return 5;
    if (d.includes('extreme') || d.includes('eliminate')) return 4;
    if (d.includes('high') || d.includes('proactively')) return 3;
    if (d.includes('medium') || d.includes('actively')) return 2;
    if (d.includes('low') || d.includes('monitor')) return 1;
    return 0;
  };

  // Filter & sort
  const filtered = unique
    .filter(e => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        e.product_name?.toLowerCase().includes(q) ||
        e.supplier_name?.toLowerCase().includes(q);
      const desc = (e.Risk_Rating_Desc || '').toLowerCase();
      const product = products.find(p => p.file_sha256 === e.file_sha256);
      const isFastTrack = !product;
      const matchRisk = Array.from(filterRisks).some(r => {
        if (r === 'fast_track') return isFastTrack;
        if (r === 'extreme') return desc.includes('extreme') || desc.includes('eliminate');
        if (r === 'high') return desc.includes('high') || desc.includes('proactively');
        if (r === 'medium') return desc.includes('medium') || desc.includes('actively');
        if (r === 'low') return desc.includes('low') || desc.includes('monitor');
        return false;
      });
      const matchTop25 = !filterTop25 || e.Top_25_List === 'Yes';
      const matchStatus = e.status === 'Active';
      return matchSearch && matchRisk && matchTop25 && matchStatus;
    })
    .sort((a, b) => {
      // Sort descending by risk, then ascending by product name
      const riskDiff = riskOrder(b.Risk_Rating_Desc) - riskOrder(a.Risk_Rating_Desc);
      if (riskDiff !== 0) return riskDiff;
      return (a.product_name || '').localeCompare(b.product_name || '');
    });

  const getPictogram = (entry) => {
    const product = products.find(p => p.file_sha256 === entry.file_sha256);
    const isFastTrack = !product && (entry.Risk_Rating_Desc?.toLowerCase().includes('fast'));
    const hazardPic = entry.file_sha256 ? hazards.find(h => h.file_sha256 === entry.file_sha256)?.pictogram_url : null;
    const picUrl = product?.pictogram_url || 
      (isFastTrack ? 'https://upload.wikimedia.org/wikipedia/commons/d/da/GHS_FAST_Track.png' : null) ||
      hazardPic || 
      entry.pictogram_url;
    return picUrl ? getCachedImage(tenantId, picUrl) : null;
  };

  return (
    <div className="bg-background min-h-screen pb-20 md:pb-0">
      <MobileHeader title="HazMat Register" showBack={false} />

      {/* Online/Offline indicator */}
      {!online && (
        <div className="mx-3 mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-xs text-amber-700">
          <WifiOff size={14} /> Offline Mode
        </div>
      )}

      <div className="p-3 md:p-6 space-y-4">
        {/* Search */}
        <MobileSearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch('')}
        />

        {/* Filter Chips */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => toggleRiskFilter('extreme')}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              filterRisks.has('extreme')
                ? "bg-red-500 text-white"
                : "bg-muted text-foreground hover:bg-muted/80"
            )}
          >
            Extreme
          </button>
          <button
            onClick={() => toggleRiskFilter('high')}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              filterRisks.has('high')
                ? "bg-orange-500 text-white"
                : "bg-muted text-foreground hover:bg-muted/80"
            )}
          >
            High
          </button>
          <button
            onClick={() => toggleRiskFilter('medium')}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              filterRisks.has('medium')
                ? "bg-yellow-500 text-black"
                : "bg-muted text-foreground hover:bg-muted/80"
            )}
          >
            Medium
          </button>
          <button
            onClick={() => toggleRiskFilter('low')}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              filterRisks.has('low')
                ? "bg-green-500 text-white"
                : "bg-muted text-foreground hover:bg-muted/80"
            )}
          >
            Low
          </button>
          <button
            onClick={() => toggleRiskFilter('fast_track')}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5",
              filterRisks.has('fast_track')
                ? "bg-purple-500 text-white"
                : "bg-muted text-foreground hover:bg-muted/80"
            )}
          >
            <Zap size={12} /> Fast Track
          </button>
          <button
            onClick={() => setFilterTop25(!filterTop25)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5",
              filterTop25
                ? "bg-cyan-500 text-black"
                : "bg-muted text-foreground hover:bg-muted/80"
            )}
          >
            <Star size={12} /> Top 25
          </button>
        </div>

        {/* Stats */}
        <div className="text-xs text-muted-foreground">
          {filtered.length} of {unique.length} chemicals
        </div>

        {/* Loading */}
        {loadingReg && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {/* Results */}
        {!loadingReg && filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground space-y-3">
            <FlaskConical size={40} className="mx-auto opacity-30" />
            <p className="font-medium text-sm">No materials found</p>
            {search && (
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-amber-900 flex items-center gap-2">
                  <Zap size={14} className="text-amber-600" /> Not in register?
                </p>
                <Link to="/fast-track" state={{ substanceName: search }}>
                  <Button size="sm" className="w-full gap-1.5 h-9">
                    <Zap size={14} /> Fast Track Request
                  </Button>
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(entry => {
              const picUrl = getPictogram(entry);
              return (
                <Link key={entry.id} to={`/register/${entry.id}`}>
                  <MobileCard
                    title={entry.product_name}
                    subtitle={entry.supplier_name && `${entry.supplier_name} · ${entry.Site}`}
                    description={entry.Responsible_Department}
                    icon={
                      picUrl ? (
                        <img src={picUrl} alt="hazard" className="w-10 h-10 object-contain" />
                      ) : (
                        <FlaskConical size={20} className="text-primary" />
                      )
                    }
                    badge={<RiskChip rating={entry.Risk_Rating_Desc} size="md" />}
                  />
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <MobileBottomNav />
    </div>
  );
}

export default function HazMatRegister() {
  return <TenantGate><HazMatRegisterInner /></TenantGate>;
}