import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { Plus, Building2, Truck, FlaskConical, ChevronRight, Shield, Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import AllTenantsAndSites from '@/components/admin/AllTenantsAndSites';

export default function Admin() {
  const { user } = useAuth();
  const { tenantId, canEdit, isSuperAdmin } = useTenant();
  const [sites, setSites] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = canEdit;

  useEffect(() => {
    if (!tenantId && !isSuperAdmin) return;
    const filter = tenantId ? { tenant_id: tenantId } : {};
    Promise.all([
      base44.entities.Site.filter(filter),
      base44.entities.Supplier.filter(filter),
      base44.entities.ProductMaster.filter({ ...filter, is_current: true }, '-updated_date', 100),
    ]).then(([s, sup, p]) => {
      setSites(s);
      setSuppliers(sup);
      setProducts(p);
      setLoading(false);
    });
  }, [tenantId]);

  if (!isAdmin) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full text-center">
        <Shield size={48} className="text-muted-foreground mb-4 opacity-40" />
        <h2 className="text-xl font-bold font-space-grotesk">Admin Access Required</h2>
        <p className="text-muted-foreground text-sm mt-2">You need admin privileges to access this area.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold font-space-grotesk">Admin Panel</h1>
        <p className="text-muted-foreground text-sm">Manage sites, suppliers, products, and registry entries</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Sites', value: sites.length, icon: Building2, to: '/admin/sites' },
          { label: 'Suppliers', value: suppliers.length, icon: Truck, to: '/admin/suppliers' },
          { label: 'Products', value: products.length, icon: FlaskConical, to: '/admin/products' },
          { label: 'New Entry', value: '+', icon: Plus, to: '/admin/new-entry' },
          { label: 'Sync Monitor', value: '⚡', icon: Activity, to: '/sync-monitor' },
        ...(isSuperAdmin ? [{ label: 'Tenants', value: '🏢', icon: Building2, to: '/admin/tenants' }] : []),
        ].map(item => (
          <Link key={item.label} to={item.to}>
            <Card className="hover:shadow-md hover:border-primary/40 transition-all cursor-pointer">
              <CardContent className="p-4 text-center">
                <item.icon size={22} className="mx-auto mb-2 text-primary" />
                <p className="text-2xl font-bold font-space-grotesk">{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Tabs defaultValue={isSuperAdmin ? "all" : "sites"}>
        <TabsList>
          {isSuperAdmin && <TabsTrigger value="all">All Tenants & Sites</TabsTrigger>}
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
        </TabsList>

        {isSuperAdmin && (
          <TabsContent value="all" className="mt-3">
            <AllTenantsAndSites />
          </TabsContent>
        )}

        <TabsContent value="sites" className="space-y-2 mt-3">
          <div className="flex justify-end">
            <Link to="/admin/sites/new"><Button size="sm"><Plus size={14} className="mr-1" /> New Site</Button></Link>
          </div>
          {loading ? <div className="py-8 text-center text-muted-foreground">Loading...</div> :
            sites.map(s => (
              <Link key={s.id} to={`/admin/sites/${s.id}`}>
                <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 hover:border-primary/40 transition-all">
                  <Building2 size={16} className="text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.site_parent} {s.location && `· ${s.location}`}</p>
                  </div>
                  <Badge variant={s.is_active ? 'default' : 'secondary'} className="text-xs">{s.is_active !== false ? 'Active' : 'Inactive'}</Badge>
                  <ChevronRight size={14} className="text-muted-foreground" />
                </div>
              </Link>
            ))
          }
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-2 mt-3">
          <div className="flex justify-end">
            <Link to="/admin/suppliers/new"><Button size="sm"><Plus size={14} className="mr-1" /> New Supplier</Button></Link>
          </div>
          {loading ? <div className="py-8 text-center text-muted-foreground">Loading...</div> :
            suppliers.map(s => (
              <Link key={s.id} to={`/admin/suppliers/${s.id}`}>
                <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 hover:border-primary/40 transition-all">
                  <Truck size={16} className="text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.contact_email} {s.contact_phone && `· ${s.contact_phone}`}</p>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground" />
                </div>
              </Link>
            ))
          }
        </TabsContent>

        <TabsContent value="products" className="space-y-2 mt-3">
          <div className="flex justify-end">
            <Link to="/admin/products/new"><Button size="sm"><Plus size={14} className="mr-1" /> New Product</Button></Link>
          </div>
          {loading ? <div className="py-8 text-center text-muted-foreground">Loading...</div> :
            products.map(p => (
              <Link key={p.id} to={`/admin/products/${p.id}`}>
                <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 hover:border-primary/40 transition-all">
                  <FlaskConical size={16} className="text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{p.product_name}</p>
                    <p className="text-xs text-muted-foreground">{p.supplier_name} {p.cas_number && `· CAS: ${p.cas_number}`}</p>
                  </div>
                  {p.default_risk_rating && (
                    <Badge className="text-xs" variant="outline">{p.default_risk_rating}</Badge>
                  )}
                  <ChevronRight size={14} className="text-muted-foreground" />
                </div>
              </Link>
            ))
          }
        </TabsContent>
      </Tabs>
    </div>
  );
}