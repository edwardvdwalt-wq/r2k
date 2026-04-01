import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Building2, MapPin, ChevronRight, Search, Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

export default function AllTenantsAndSites() {
  const [tenants, setTenants] = useState([]);
  const [sites, setSites] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.Tenant.list(null, 500),
      base44.entities.Site.list(null, 2000),
    ]).then(([t, s]) => {
      setTenants(t);
      setSites(s);
      setLoading(false);
    });
  }, []);

  const q = search.toLowerCase().trim();

  const filteredTenants = tenants.filter(t => {
    if (!q) return true;
    return (
      t.name?.toLowerCase().includes(q) ||
      t.slug?.toLowerCase().includes(q) ||
      t.industry?.toLowerCase().includes(q) ||
      t.country?.toLowerCase().includes(q)
    );
  });

  const sitesForTenant = (tenantId) => {
    const ts = sites.filter(s => s.tenant_id === tenantId);
    if (!q) return ts;
    return ts.filter(s =>
      s.name?.toLowerCase().includes(q) ||
      s.location?.toLowerCase().includes(q) ||
      s.region?.toLowerCase().includes(q)
    );
  };

  // Also include tenants that have matching sites even if tenant name doesn't match
  const visibleTenants = q
    ? tenants.filter(t =>
        t.name?.toLowerCase().includes(q) ||
        t.slug?.toLowerCase().includes(q) ||
        t.industry?.toLowerCase().includes(q) ||
        t.country?.toLowerCase().includes(q) ||
        sitesForTenant(t.id).length > 0
      )
    : tenants;

  if (loading) return <div className="py-8 text-center text-muted-foreground text-sm">Loading tenants and sites…</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tenants or sites…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{tenants.length} tenants · {sites.length} sites</span>
      </div>

      {visibleTenants.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground text-sm">No results found.</div>
      ) : (
        visibleTenants.map(tenant => {
          const tenantSites = sitesForTenant(tenant.id);
          return (
            <div key={tenant.id} className="border border-border rounded-xl overflow-hidden">
              {/* Tenant Header */}
              <Link to={`/admin/tenants/${tenant.id}`}>
                <div className="bg-muted/40 px-4 py-3 flex items-center gap-3 hover:bg-muted/70 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Globe size={14} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{tenant.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {tenant.slug}
                      {tenant.industry && ` · ${tenant.industry}`}
                      {tenant.country && ` · ${tenant.country}`}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">{tenantSites.length} site{tenantSites.length !== 1 ? 's' : ''}</Badge>
                  <Badge variant={tenant.is_active !== false ? 'default' : 'secondary'} className="text-xs shrink-0">
                    {tenant.is_active !== false ? 'Active' : 'Inactive'}
                  </Badge>
                  <ChevronRight size={13} className="text-muted-foreground shrink-0" />
                </div>
              </Link>

              {/* Sites under this tenant */}
              {tenantSites.length > 0 ? (
                <div className="divide-y divide-border">
                  {tenantSites.map(site => (
                    <Link key={site.id} to={`/admin/sites/${site.id}`}>
                      <div className="px-4 py-2.5 pl-14 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                        <MapPin size={13} className="text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{site.name}</p>
                          {(site.location || site.region) && (
                            <p className="text-xs text-muted-foreground">{[site.location, site.region].filter(Boolean).join(' · ')}</p>
                          )}
                        </div>
                        <Badge variant={site.is_active !== false ? 'default' : 'secondary'} className="text-xs">
                          {site.is_active !== false ? 'Active' : 'Inactive'}
                        </Badge>
                        <ChevronRight size={12} className="text-muted-foreground" />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-2.5 pl-14 text-xs text-muted-foreground italic">No sites for this tenant yet.</div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}