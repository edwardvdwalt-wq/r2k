import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { FlaskConical, AlertTriangle, Star, Building2, RefreshCw, ChevronRight, Loader2, CheckCircle2 } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import TenantGate from '@/components/shared/TenantGate';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import RiskBadge from '@/components/shared/RiskBadge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const StatCard = ({ icon: Icon, label, value, sub, color = 'text-primary', linkTo }) => (
  <Card className="hover:shadow-md transition-shadow animate-fade-in">
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium" style={{ color: '#145370' }}>{label}</p>
          <p className={`text-3xl font-bold mt-1 font-space-grotesk ${color}`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-xl bg-primary/10`}>
          <Icon size={20} className={color} />
        </div>
      </div>
      {linkTo && (
        <Link to={linkTo} className="text-xs text-primary font-medium flex items-center gap-1 mt-3 hover:gap-2 transition-all">
          View all <ChevronRight size={12} />
        </Link>
      )}
    </CardContent>
  </Card>
);

const getRiskStyle = (desc) => {
  const d = (desc || '').toLowerCase();
  if (d.includes('extreme') || d.includes('eliminate')) return { bg: '#FF0000', text: '#fff' };
  if (d.includes('high') || d.includes('proactively')) return { bg: '#FD9900', text: '#000' };
  if (d.includes('medium') || d.includes('actively')) return { bg: '#FFFF00', text: '#000' };
  if (d.includes('low') || d.includes('monitor')) return { bg: '#99CC00', text: '#000' };
  return { bg: '#999999', text: '#fff' };
};

const PieLabel = (props) => {
  const { cx, cy, midAngle, outerRadius, name } = props;
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 20;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#145370" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={12} fontWeight={600}>
      {name.split(':')[0]}
    </text>
  );
};

const RISK_COLORS = {
  'Extreme: Eliminate, avoid.': '#FF0000',
  'High: Proactively manage.': '#FD9900',
  'Medium: Actively manage.': '#FFFF00',
  'Low: Monitor and manage as appropriate.': '#99CC00'
};

function DashboardInner() {
  const {
    tenantId,
    syncMode,
    isSyncLocked,
    pipelineStatus,
    currentStep,
    lastPipelineCompletedAt,
    refreshSyncState,
  } = useTenant();
  const [registry, setRegistry] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    const fetchAll = async () => {
      try {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        
        // Fetch with exponential backoff for rate limits
        const fetchWithRetry = async (fn, maxAttempts = 3) => {
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
              return await fn();
            } catch (e) {
              if ((e.status === 429 || e.message?.includes('Rate limit')) && attempt < maxAttempts - 1) {
                const wait = Math.min(2000 * Math.pow(2, attempt), 15000);
                await sleep(wait);
              } else {
                throw e;
              }
            }
          }
        };

        // Fetch all registry via backend function (bypasses 500-record client limit)
        const regRes = await fetchWithRetry(() =>
          base44.functions.invoke('getAllRegistry', { tenant_id: tenantId })
        );
        // base44.functions.invoke returns axios response: { data: { data: [...], total: N } }
        const rawResult = regRes?.data;
        const allReg = Array.isArray(rawResult) ? rawResult : (rawResult?.data || []);
        console.log('[Dashboard] getAllRegistry returned:', allReg.length, 'records', 'rawResult keys:', rawResult ? Object.keys(rawResult) : 'null');

        await sleep(300);

        const products = await fetchWithRetry(() =>
          base44.entities.ProductMaster.filter({ tenant_id: tenantId }, '-created_date', 500)
        );
        const allProducts = Array.isArray(products) ? products : (products?.data || []);

        setRegistry(allReg);
        const productMap = {};
        allProducts.forEach(p => {
          productMap[p.file_sha256] = p;
        });
        window.__productMapCache = productMap;
        
        const deduped = [...allReg.reduce((acc, r) => {
          const key = r.Site_Chem_Id || r.id;
          if (!acc.has(key)) acc.set(key, r);
          return acc;
        }, new Map()).values()];
        const uniqueSites = [...new Set(deduped.map(r => r.Site).filter(Boolean))].map(name => ({ name, is_active: true }));
        setSites(uniqueSites);
        setLoading(false);
      } catch (e) {
        console.error('Dashboard fetch failed:', e);
        setLoading(false);
      }
    };
    fetchAll();
  }, [tenantId]);

  // Memoized calculations to avoid expensive re-filtering on every render
  const { unique, total, focus, top25, riskBreakdown, siteBreakdown, outdatedSDS } = useMemo(() => {
    const uniqueById = registry.reduce((acc, r) => {
      const key = r.Site_Chem_Id || r.id;
      if (!acc.has(key)) acc.set(key, r);
      return acc;
    }, new Map());
    const u = [...uniqueById.values()];

    const t = u.length;
    const f = u.filter(r => {
      const desc = r.Risk_Rating_Desc?.toLowerCase() || '';
      return desc.includes('extreme') || desc.includes('eliminate') || desc.includes('high') || desc.includes('proactively');
    }).length;
    const t25 = u.filter(r => r.Top_25_List === 'Yes').length;

    const riskGroups = {
      'Low: Monitor and manage as appropriate.': u.filter(x => (x.Risk_Rating_Desc || '').toLowerCase().includes('low') || (x.Risk_Rating_Desc || '').toLowerCase().includes('monitor')).length,
      'Medium: Actively manage.': u.filter(x => (x.Risk_Rating_Desc || '').toLowerCase().includes('medium') || (x.Risk_Rating_Desc || '').toLowerCase().includes('actively')).length,
      'High: Proactively manage.': u.filter(x => (x.Risk_Rating_Desc || '').toLowerCase().includes('high') || (x.Risk_Rating_Desc || '').toLowerCase().includes('proactively')).length,
      'Extreme: Eliminate, avoid.': u.filter(x => (x.Risk_Rating_Desc || '').toLowerCase().includes('extreme') || (x.Risk_Rating_Desc || '').toLowerCase().includes('eliminate')).length
    };
    
    const rb = Object.entries(riskGroups).map(([name, count]) => ({
      name,
      count,
      fill: RISK_COLORS[name]
    })).filter(r => r.count > 0);

    const sb = [...new Set(u.map(r => r.Site).filter(Boolean))].slice(0, 6).map(site => ({
      name: site.length > 12 ? site.slice(0, 12) + '…' : site,
      count: u.filter(r => r.Site === site).length
    }));

    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    
    const oSDS = u.filter(entry => {
      const product = window.__productMapCache?.[entry.file_sha256];
      if (!product || !product.sds_date) return false;
      const sdsDate = new Date(product.sds_date);
      return sdsDate < fiveYearsAgo;
    }).map(entry => ({
      ...entry,
      sdsDate: window.__productMapCache?.[entry.file_sha256]?.sds_date
    })).sort((a, b) => {
      return new Date(a.sdsDate) - new Date(b.sdsDate);
    }).slice(0, 6);

    return { unique: u, total: t, focus: f, top25: t25, riskBreakdown: rb, siteBreakdown: sb, outdatedSDS: oSDS };
  }, [registry]);

  if (loading) return (
    <div className="flex items-center justify-center h-full p-12">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
         <div>
           <h1 className="text-2xl font-bold font-space-grotesk" style={{ color: '#145370' }}>Dashboard</h1>
           <p className="text-sm mt-0.5" style={{ color: '#145370' }}>HazMat Register Overview</p>
         </div>
         <div className="flex flex-col items-end gap-1">
           <div className="flex items-center gap-2">
             {syncMode === 'incremental' && (
               <Button
                 size="sm"
                 onClick={async () => {
                   setSyncing(true);
                   try {
                     await base44.functions.invoke('orchestrateTenantSync', { site_parent: tenantId, force: false });
                     await refreshSyncState();
                   } catch (e) {
                     console.error('Incremental sync failed:', e);
                   } finally {
                     setSyncing(false);
                   }
                 }}
                 disabled={syncing || pipelineStatus === 'running' || isSyncLocked}
               >
                 {syncing || pipelineStatus === 'running' ? (
                   <><Loader2 size={14} className="mr-1.5 animate-spin" /> Syncing…</>
                 ) : (
                   <><RefreshCw size={14} className="mr-1.5" /> Sync Now</>
                 )}
               </Button>
             )}
             <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
               <RefreshCw size={14} className="mr-1.5" /> Refresh Screen
             </Button>
           </div>
           {syncMode === 'full' && (
             <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1 max-w-xs text-right">
               Full Sync mode is active — use <Link to="/sync-monitor" className="underline">Sync Monitor</Link> to run it.
             </p>
           )}
         </div>
       </div>

      {/* Pipeline status banner — driven by TenantContext */}
      {pipelineStatus === 'running' && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700">
          <Loader2 size={14} className="animate-spin flex-shrink-0" />
          <span>Sync in progress{currentStep ? ` — ${currentStep}` : '…'}</span>
        </div>
      )}
      {pipelineStatus === 'success' && lastPipelineCompletedAt && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">
          <CheckCircle2 size={14} className="flex-shrink-0" />
          <span>Last sync completed {new Date(lastPipelineCompletedAt).toLocaleString()}</span>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FlaskConical} label="Total Chemicals" value={total} sub={`Across ${sites.length} sites`} linkTo="/register" />
        <StatCard icon={AlertTriangle} label="Focus" value={focus} sub="Prioritize Risk Assessment" color="text-red-500" linkTo="/register?riskFilter=focus" />
        <StatCard icon={Star} label="Top 25 List" value={top25} sub="Priority substances" color="text-yellow-600" linkTo="/register" />
        <StatCard icon={Building2} label="Active Sites" value={sites.filter(s => s.is_active).length} sub="Operational sites" color="text-[#145370]" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base" style={{ color: '#145370' }}>Risk Rating Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {riskBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={riskBreakdown} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={<PieLabel />} labelLine={false}>
                    {riskBreakdown.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base" style={{ color: '#145370' }}>Chemicals by Site</CardTitle>
          </CardHeader>
          <CardContent>
            {siteBreakdown.some(s => s.count > 0) ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={siteBreakdown} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SDS Documents Requiring Update */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base" style={{ color: '#145370' }}>SDS Documents Requiring Update</CardTitle>
          <Link to="/sds-documents-update"><Button variant="ghost" size="sm">View All <ChevronRight size={14} className="ml-1" /></Button></Link>
        </CardHeader>
        <CardContent className="p-0">
           {outdatedSDS.length === 0 ? (
             <div className="p-8 text-center text-muted-foreground text-sm">All SDS documents are current. <Link to="/admin" className="text-primary">Add one →</Link></div>
           ) : (
             <div className="space-y-2 p-4">
               {outdatedSDS.map(entry => (
                 <Link key={entry.id} to={`/register/${entry.id}`}>
                   <div className="bg-card border border-border rounded-xl px-4 py-3 hover:border-primary/40 hover:shadow-sm transition-all flex items-center gap-3">
                     <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shrink-0 bg-white/30">
                       {entry.pictogram_url ? (
                         <img src={entry.pictogram_url} alt="hazard" className="w-8 h-8 object-contain" />
                       ) : (
                         <FlaskConical size={16} className="text-primary" />
                       )}
                     </div>
                     <div className="flex-1 min-w-0">
                       <p className="font-medium text-sm">{entry.product_name}</p>
                       <p className="text-xs text-muted-foreground">{entry.Site} · {entry.supplier_name}</p>
                       <p className="text-xs text-muted-foreground">SDS Date: {entry.sdsDate ? new Date(entry.sdsDate).toLocaleDateString() : 'N/A'}</p>
                     </div>
                     <RiskBadge rating={entry.Risk_Rating_Desc} />
                     <ChevronRight size={14} className="text-muted-foreground" />
                   </div>
                 </Link>
               ))}
             </div>
           )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  return <TenantGate><DashboardInner /></TenantGate>;
}