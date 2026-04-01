import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { FlaskConical, Zap, Clock, AlertCircle } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import TenantGate from '@/components/shared/TenantGate';
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileCard from '@/components/mobile/MobileCard';
import MobileSearchInput from '@/components/mobile/MobileSearchInput';
import MobileBottomNav from '@/components/mobile/MobileBottomNav';
import RiskChip from '@/components/mobile/RiskChip';
import { useOfflineData } from '@/lib/useOfflineData';
import { getCachedImage } from '@/lib/imageCache';
import { Button } from '@/components/ui/button';

function SearchPageInner() {
  const [search, setSearch] = useState('');
  const [recentSearches, setRecentSearches] = useState([]);
  const { tenantId } = useTenant();

  const { data: entries, loading } = useOfflineData(
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

  // Load recent searches from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`hazmat-recent-${tenantId}`);
    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored).slice(0, 5));
      } catch {
        // ignore
      }
    }
  }, [tenantId]);

  // Deduplicate entries
  const unique = [...entries.reduce((acc, e) => {
    const key = `${e.file_sha256}|${e.product_name}`;
    const existing = acc.get(key);
    if (!existing || new Date(e.created_date) > new Date(existing.created_date)) {
      acc.set(key, e);
    }
    return acc;
  }, new Map()).values()];

  // Filter by search
  const results = search.trim().length < 2 
    ? []
    : unique
        .filter(e => {
          const q = search.toLowerCase();
          return (
            e.product_name?.toLowerCase().includes(q) ||
            e.supplier_name?.toLowerCase().includes(q) ||
            e.Responsible_Department?.toLowerCase().includes(q)
          );
        })
        .filter(e => e.status === 'Active')
        .sort((a, b) => {
          // Exact match first, then contains
          const aExact = a.product_name?.toLowerCase() === search.toLowerCase();
          const bExact = b.product_name?.toLowerCase() === search.toLowerCase();
          if (aExact !== bExact) return aExact ? -1 : 1;
          
          // Then by risk
          const riskOrder = (desc) => {
            const d = (desc || '').toLowerCase();
            if (d.includes('extreme')) return 4;
            if (d.includes('high')) return 3;
            if (d.includes('medium')) return 2;
            return 1;
          };
          return riskOrder(b.Risk_Rating_Desc) - riskOrder(a.Risk_Rating_Desc);
        });

  const handleSearch = (value) => {
    setSearch(value);
    if (value.trim().length > 0) {
      const updated = [value, ...recentSearches.filter(s => s !== value)].slice(0, 5);
      setRecentSearches(updated);
      localStorage.setItem(`hazmat-recent-${tenantId}`, JSON.stringify(updated));
    }
  };

  const getPictogram = (entry) => {
    const product = products.find(p => p.file_sha256 === entry.file_sha256);
    const hazardPic = entry.file_sha256 ? hazards.find(h => h.file_sha256 === entry.file_sha256)?.pictogram_url : null;
    const picUrl = product?.pictogram_url || hazardPic || entry.pictogram_url;
    return picUrl ? getCachedImage(tenantId, picUrl) : null;
  };

  return (
    <div className="bg-background min-h-screen pb-20 md:pb-0">
      <MobileHeader title="Search" showBack={false} />

      <div className="p-3 md:p-6 space-y-4">
        {/* Search Input */}
        <MobileSearchInput
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          onClear={() => {
            setSearch('');
          }}
          placeholder="Search materials, suppliers..."
        />

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {/* Results */}
        {!loading && results.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-3">
              {results.length} {results.length === 1 ? 'result' : 'results'} for "{search}"
            </p>
            <div className="space-y-2">
              {results.map(entry => {
                const picUrl = getPictogram(entry);
                return (
                  <Link key={entry.id} to={`/register/${entry.id}`}>
                    <MobileCard
                      title={entry.product_name}
                      subtitle={`${entry.supplier_name || '?'} · ${entry.Site || '?'}`}
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
          </div>
        ) : !loading && search.trim().length > 0 ? (
          // No results
          <div className="text-center py-12 space-y-4">
            <AlertCircle size={40} className="mx-auto text-muted-foreground/50" />
            <div>
              <p className="font-medium text-sm">No results for "{search}"</p>
              <p className="text-xs text-muted-foreground mt-1">Try a different search term</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3 mt-6">
              <p className="text-xs font-semibold text-amber-900 flex items-center gap-2">
                <Zap size={14} className="text-amber-600" /> Not in register?
              </p>
              <p className="text-xs text-amber-700">
                Submit a Fast Track request for admin review.
              </p>
              <Link to="/fast-track" state={{ substanceName: search }}>
                <Button size="sm" className="w-full h-8 gap-1.5">
                  <Zap size={14} /> Fast Track Request
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          // Empty state
          <div className="text-center py-12 space-y-4">
            <FlaskConical size={40} className="mx-auto text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Enter a search to find materials</p>
            
            {/* Recent Searches */}
            {recentSearches.length > 0 && (
              <div className="mt-8 pt-8 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-3">Recent Searches</p>
                <div className="space-y-2">
                  {recentSearches.map((term, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSearch(term)}
                      className="w-full text-left px-4 py-2.5 rounded-lg hover:bg-muted transition-colors flex items-center gap-2 text-sm"
                    >
                      <Clock size={14} className="text-muted-foreground" />
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <MobileBottomNav />
    </div>
  );
}

export default function SearchPage() {
  return <TenantGate><SearchPageInner /></TenantGate>;
}