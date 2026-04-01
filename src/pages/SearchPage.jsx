import { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Search, FlaskConical, Building2, ChevronRight, Loader2 } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import TenantGate from '@/components/shared/TenantGate';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import RiskBadge from '@/components/shared/RiskBadge';

function SearchPageInner() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ registry: [], products: [], sites: [] });
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const { tenantId } = useTenant();

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim() || !tenantId) return;
    setLoading(true);
    setSearched(true);

    const q = query.toLowerCase();
    const [registry, products, sites] = await Promise.all([
      base44.entities.HazMatRegistry.filter({ tenant_id: tenantId }, '-updated_date', 500),
      base44.entities.ProductMaster.filter({ tenant_id: tenantId }, '-updated_date', 200),
      base44.entities.Site.filter({ tenant_id: tenantId }),
    ]);

    setResults({
      registry: registry.filter(r =>
        r.product_name?.toLowerCase().includes(q) ||
        r.supplier_name?.toLowerCase().includes(q) ||
        r.department?.toLowerCase().includes(q) ||
        r.erp_number?.toLowerCase().includes(q) ||
        r.contractor?.toLowerCase().includes(q) ||
        r.site_name?.toLowerCase().includes(q)
      ).slice(0, 30),
      products: products.filter(p =>
        p.product_name?.toLowerCase().includes(q) ||
        p.supplier_name?.toLowerCase().includes(q) ||
        p.cas_number?.toLowerCase().includes(q) ||
        p.product_code?.toLowerCase().includes(q)
      ).slice(0, 20),
      sites: sites.filter(s =>
        s.name?.toLowerCase().includes(q) ||
        s.site_parent?.toLowerCase().includes(q) ||
        s.location?.toLowerCase().includes(q)
      ),
    });

    setLoading(false);
  };

  const total = results.registry.length + results.products.length + results.sites.length;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold font-space-grotesk">Search</h1>
        <p className="text-muted-foreground text-sm">Search across the entire HazMat register</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by product name, CAS number, supplier, site, department, ERP..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
        </Button>
      </form>

      {!searched && (
        <div className="text-center py-16 text-muted-foreground">
          <Search size={48} className="mx-auto mb-4 opacity-20" />
          <p className="font-medium">Enter a search term to begin</p>
          <p className="text-sm mt-1">You can search by product name, supplier, CAS number, site, department, or ERP number</p>
        </div>
      )}

      {searched && !loading && (
        <div>
          <p className="text-sm text-muted-foreground mb-3">{total} results for "<span className="font-medium text-foreground">{query}</span>"</p>
          <Tabs defaultValue="registry">
            <TabsList>
              <TabsTrigger value="registry">Registry ({results.registry.length})</TabsTrigger>
              <TabsTrigger value="products">Products ({results.products.length})</TabsTrigger>
              <TabsTrigger value="sites">Sites ({results.sites.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="registry" className="mt-3 space-y-2">
              {results.registry.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No registry entries found</div>
              ) : (
                results.registry.map(entry => (
                  <Link key={entry.id} to={`/register/${entry.id}`}>
                    <div className="bg-card border border-border rounded-xl px-4 py-3 hover:border-primary/40 hover:shadow-sm transition-all flex items-center gap-3">
                      <FlaskConical size={16} className="text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{entry.product_name}</p>
                        <p className="text-xs text-muted-foreground">{entry.site_name} · {entry.supplier_name}</p>
                      </div>
                      <RiskBadge rating={entry.risk_rating} />
                      <ChevronRight size={14} className="text-muted-foreground" />
                    </div>
                  </Link>
                ))
              )}
            </TabsContent>

            <TabsContent value="products" className="mt-3 space-y-2">
              {results.products.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No products found</div>
              ) : (
                results.products.map(p => (
                  <div key={p.id} className="bg-card border border-border rounded-xl px-4 py-3">
                    <div className="flex items-start gap-3">
                      <FlaskConical size={16} className="text-primary shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{p.product_name}</p>
                        <p className="text-xs text-muted-foreground">{p.supplier_name} {p.cas_number && `· CAS: ${p.cas_number}`}</p>
                        {p.sds_revision_date && <p className="text-xs text-muted-foreground">SDS Revised: {p.sds_revision_date}</p>}
                      </div>
                      <RiskBadge rating={p.default_risk_rating} />
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="sites" className="mt-3 space-y-2">
              {results.sites.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No sites found</div>
              ) : (
                results.sites.map(s => (
                  <div key={s.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
                    <Building2 size={16} className="text-primary shrink-0" />
                    <div>
                      <p className="font-medium text-sm">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.site_parent} {s.location && `· ${s.location}`}</p>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return <TenantGate><SearchPageInner /></TenantGate>;
}