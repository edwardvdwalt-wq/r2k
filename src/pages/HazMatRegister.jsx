import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Search, Plus, Star, ChevronRight, FlaskConical, X, WifiOff, Zap, RefreshCw } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import { useRBAC } from '@/lib/useRBAC';
import TenantGate from '@/components/shared/TenantGate';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import RiskBadge from '@/components/shared/RiskBadge';
import { useOfflineData } from '@/lib/useOfflineData';
import { getCachedImage } from '@/lib/imageCache';

function HazMatRegisterInner() {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [filterSite, setFilterSite] = useState('all');
  const [filterRisk, setFilterRisk] = useState([]);
  const [filterTop25, setFilterTop25] = useState(false);
  const [filterStatus, setFilterStatus] = useState('Active');
  const { tenantId, canEdit } = useTenant();
  const { canEditRegister } = useRBAC();
  const isAdmin = canEdit;

  // Apply URL query parameter for riskFilter
  useEffect(() => {
    const riskFilter = searchParams.get('riskFilter');
    if (riskFilter === 'focus') {
      setFilterRisk(['Extreme', 'High']);
    }
  }, [searchParams]);

  // Fetch with pagination to avoid rate limits
  const fetchAllEntities = async (entityName) => {
    let all = [];
    let offset = 0;
    const pageSize = 500;
    while (true) {
      const page = await base44.entities[entityName].filter({ tenant_id: tenantId }, '-created_date', pageSize, offset);
      const arr = Array.isArray(page) ? page : (page?.data || []);
      if (arr.length === 0) break;
      all = all.concat(arr);
      if (arr.length < pageSize) break;
      offset += pageSize;
      await new Promise(r => setTimeout(r, 50)); // 50ms delay between pages
    }
    return all;
  };

  // Fetch all entities in parallel (safe since each entity has independent request streams)
  const fetchAllSequential = async () => {
    const [registry, siteList, productList, hazardList] = await Promise.all([
      fetchAllEntities('HazMatRegistry'),
      fetchAllEntities('Site'),
      fetchAllEntities('ProductMaster'),
      fetchAllEntities('Hazard'),
    ]);
    return { registry, siteList, productList, hazardList };
  };

  const { data: allData = { registry: [], siteList: [], productList: [], hazardList: [] }, loading: loadingAll, online } = useOfflineData(
    tenantId, 'HazMatRegistry',
    fetchAllSequential
  );
  
  const entries = allData.registry || [];
  const sites = allData.siteList || [];
  const products = allData.productList || [];
  const hazards = allData.hazardList || [];
  const loading = loadingAll;

  // Index products and hazards by file_sha256 for O(1) lookup
  const productMap = new Map();
  products.forEach(p => {
    if (p.file_sha256 && p.is_current !== false) {
      if (!productMap.has(p.file_sha256)) productMap.set(p.file_sha256, p);
    }
  });
  const hazardMap = new Map();
  hazards.forEach(h => {
    if (h.file_sha256) {
      if (!hazardMap.has(h.file_sha256)) hazardMap.set(h.file_sha256, h);
    }
  });

  // Deduplicate by file_sha256 + product_name (keep most recent by created_date)
  const unique = [...entries.reduce((acc, e) => {
    const key = `${e.file_sha256}|${e.product_name}`;
    const existing = acc.get(key);
    if (!existing || new Date(e.created_date) > new Date(existing.created_date)) {
      acc.set(key, e);
    }
    return acc;
  }, new Map()).values()];

  // Distinct site names from registry for filter dropdown (Site field)
  const siteNames = [...new Set(unique.map(e => e.Site).filter(Boolean))];

  // Risk colour mapping keyed on Risk_Rating_Desc (partial match)
  const getRiskStyle = (desc) => {
    const d = (desc || '').toLowerCase();
    if (d.includes('extreme') || d.includes('eliminate')) return { bg: '#FF0000', text: '#fff' };
    if (d.includes('high') || d.includes('proactively')) return { bg: '#FD9900', text: '#000' };
    if (d.includes('medium') || d.includes('actively')) return { bg: '#FFFF00', text: '#000' };
    if (d.includes('low') || d.includes('monitor')) return { bg: '#99CC00', text: '#000' };
    return { bg: null, text: null };
  };

  // Risk sort order: Extreme=4, High=3, Medium=2, Low=1, unknown=0
  const riskOrder = (desc) => {
    const d = (desc || '').toLowerCase();
    if (d.includes('fast') || d.includes('security')) return 5;
    if (d.includes('extreme') || d.includes('eliminate')) return 4;
    if (d.includes('high') || d.includes('proactively')) return 3;
    if (d.includes('medium') || d.includes('actively')) return 2;
    if (d.includes('low') || d.includes('monitor')) return 1;
    return 0;
  };

  const filtered = unique.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      e.product_name?.toLowerCase().includes(q) ||
      e.supplier_name?.toLowerCase().includes(q) ||
      e.Responsible_Department?.toLowerCase().includes(q) ||
      e.ERP_Number?.toLowerCase().includes(q) ||
      e.Onsite_Contractor?.toLowerCase().includes(q) ||
      e.Site?.toLowerCase().includes(q);
    const matchSite = filterSite === 'all' || e.Site === filterSite;
    const matchRisk = filterRisk.length === 0 || filterRisk.some(r => (e.Risk_Rating_Desc || '').toLowerCase().includes(r.toLowerCase()));
    const matchTop25 = !filterTop25 || e.Top_25_List === 'Yes';
    const matchStatus = !filterStatus || filterStatus === 'all' || e.status === filterStatus;
    return matchSearch && matchSite && matchRisk && matchTop25 && matchStatus;
  }).sort((a, b) => {
    // Sort descending by risk, then ascending by product name
    const riskDiff = riskOrder(b.Risk_Rating_Desc) - riskOrder(a.Risk_Rating_Desc);
    if (riskDiff !== 0) return riskDiff;
    return (a.product_name || '').localeCompare(b.product_name || '');
  });

  const clearFilters = () => {
    setSearch('');
    setFilterSite('all');
    setFilterRisk([]);
    setFilterTop25(false);
    setFilterStatus('Active');
  };

  const hasFilters = search || filterSite !== 'all' || filterRisk.length > 0 || filterTop25 || filterStatus !== 'Active';

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
         <div>
           <h1 className="text-2xl font-bold font-space-grotesk">HazMat Register</h1>
           <p className="text-muted-foreground text-sm flex items-center gap-1.5">
             {filtered.length} of {unique.length} entries
             {!online && <span className="inline-flex items-center gap-1 text-amber-600 text-xs"><WifiOff size={11} /> Offline</span>}
           </p>
         </div>
         <div className="flex items-center gap-2">
           {canEditRegister && (
             <Link to="/admin/new-entry">
               <Button size="sm" className="gap-1.5">
                 <Plus size={14} /> New Entry
               </Button>
             </Link>
           )}
         </div>
       </div>

      {/* Search & Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by product, supplier, department, ERP number..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={filterSite} onValueChange={setFilterSite}>
              <SelectTrigger className="w-40 h-8 text-sm">
                <SelectValue placeholder="All Sites" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sites</SelectItem>
                {siteNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2">
              {['Low', 'Medium', 'High', 'Extreme', 'Fast Track'].map(risk => (
                <button
                  key={risk}
                  onClick={() => {
                    if (filterRisk.includes(risk)) {
                      setFilterRisk(filterRisk.filter(r => r !== risk));
                    } else {
                      setFilterRisk([...filterRisk, risk]);
                    }
                  }}
                  className={`h-8 px-3 rounded-md text-sm font-medium transition-colors ${
                    filterRisk.includes(risk)
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-input bg-background hover:bg-accent'
                  }`}
                >
                  {risk}
                </button>
              ))}
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36 h-8 text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Archived">Archived</SelectItem>
                <SelectItem value="Pending Review">Pending Review</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={filterTop25 ? 'default' : 'outline'}
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setFilterTop25(!filterTop25)}
            >
              <Star size={13} /> Top 25
            </Button>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground" onClick={clearFilters}>
                <X size={13} /> Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground space-y-3">
          <FlaskConical size={40} className="mx-auto opacity-30" />
          <p className="font-medium">No entries found</p>
          <p className="text-sm">Try adjusting your filters</p>
          {search && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 max-w-sm mx-auto text-left">
              <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                <Zap size={14} className="text-amber-600" /> Substance not found?
              </p>
              <p className="text-xs text-amber-700 mt-1">
                If <strong>"{search}"</strong> is not in the register, submit a Fast Track request for admin review.
              </p>
              <Link to={`/fast-track`} state={{ substanceName: search }}>
                <button className="mt-3 w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">
                  <Zap size={14} /> Create Fast Track Request
                </button>
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(entry => {
            const { bg, text } = getRiskStyle(entry.Risk_Rating_Desc);
            return (
              <Link key={entry.id} to={`/register/${entry.id}`}>
                <div
                  className="border-2 rounded-xl px-4 py-3.5 hover:shadow-md transition-all flex items-center gap-4"
                  style={bg ? { backgroundColor: bg, borderColor: '#000' } : { borderColor: '#000' }}
                >
                  {/* Pictogram icon from ProductMaster, fallback to registry, then FlaskConical */}
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center shrink-0 bg-white/30">
                    {(() => {
                        const product = productMap.get(entry.file_sha256);
                        const isFastTrack = !product && (entry.Risk_Rating_Desc?.toLowerCase().includes('fast') || !entry.file_sha256);
                        const hazardPic = entry.file_sha256 ? hazardMap.get(entry.file_sha256)?.pictogram_url : null;
                      const picUrl = product?.pictogram_url 
                        || (isFastTrack ? 'https://upload.wikimedia.org/wikipedia/commons/d/da/GHS_FAST_Track.png' : null)
                        || hazardPic 
                        || entry.pictogram_url;
                      const cachedSrc = picUrl ? getCachedImage(tenantId, picUrl) : null;
                      return cachedSrc ? (
                        <img src={cachedSrc} alt="hazard" className="w-10 h-10 object-contain" />
                      ) : picUrl ? (
                        <img src={picUrl} alt="hazard" className="w-10 h-10 object-contain" crossOrigin="anonymous" onError={() => {}} />
                      ) : (
                        <FlaskConical size={18} style={text ? { color: text } : {}} className="text-primary" />
                      );
                    })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm truncate" style={text ? { color: text } : {}}>{entry.product_name}</p>
                      {entry.Top_25_List === 'Yes' && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium bg-yellow-50 border border-yellow-300 text-yellow-800 rounded px-1.5 py-0.5">
                          <Star size={10} /> Top 25
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={text ? { color: text, opacity: 0.85 } : { color: 'hsl(var(--muted-foreground))' }}>
                      {entry.supplier_name && `${entry.supplier_name} · `}{entry.Site}
                      {entry.Responsible_Department && ` · ${entry.Responsible_Department}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {entry.status && entry.status !== 'Active' && (
                      <Badge variant="outline" className="text-xs">{entry.status}</Badge>
                    )}
                    <RiskBadge rating={entry.Risk_Rating_Desc || String(entry.Risk_Rating || '')} />
                    <ChevronRight size={14} style={text ? { color: text } : {}} className="text-muted-foreground" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function HazMatRegister() {
  return <TenantGate><HazMatRegisterInner /></TenantGate>;
}