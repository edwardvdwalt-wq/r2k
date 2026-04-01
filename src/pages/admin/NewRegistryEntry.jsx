import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { ArrowLeft, AlertTriangle, FlaskConical } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

export default function NewRegistryEntry() {
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const [sites, setSites] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [form, setForm] = useState({
    product_name: '', site_id: '', supplier_id: '', product_master_id: '',
    department: '', contractor: '', erp_number: '', vehicle_registration: '',
    storage_location: '', storage_quantity: '', storage_unit: '',
    risk_rating: '', risk_description: '', is_top_25: false,
    support_contact_name: '', support_contact_phone: '', notes: '', status: 'Active'
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    Promise.all([
      base44.entities.Site.filter({ tenant_id: tenantId }),
      base44.entities.Supplier.filter({ tenant_id: tenantId }),
      base44.entities.ProductMaster.filter({ tenant_id: tenantId, is_current: true }),
    ]).then(([s, sup, p]) => { setSites(s); setSuppliers(sup); setProducts(p); });
  }, [tenantId]);

  // Duplicate detection
  useEffect(() => {
    if (form.product_name.length < 3 || !form.site_id) { setDuplicates([]); return; }
    const timer = setTimeout(async () => {
      const all = await base44.entities.HazMatRegistry.filter({ tenant_id: tenantId, site_id: form.site_id });
      const dups = all.filter(e =>
        e.product_name?.toLowerCase().includes(form.product_name.toLowerCase()) &&
        e.status !== 'Archived'
      );
      setDuplicates(dups);
    }, 500);
    return () => clearTimeout(timer);
  }, [form.product_name, form.site_id]);

  const handleProductSelect = (productId) => {
    const p = products.find(p => p.id === productId);
    if (p) {
      setForm(f => ({
        ...f,
        product_master_id: p.id,
        product_name: f.product_name || p.product_name,
        supplier_id: p.supplier_id || f.supplier_id,
        supplier_name: p.supplier_name || f.supplier_name,
        file_sha256: p.file_sha256,
        risk_rating: f.risk_rating || p.default_risk_rating || '',
      }));
    }
  };

  const handleSiteSelect = (siteId) => {
    const s = sites.find(s => s.id === siteId);
    setForm(f => ({ ...f, site_id: siteId, site_name: s?.name || '', site_parent: s?.site_parent || '' }));
  };

  const handleSupplierSelect = (supplierId) => {
    const s = suppliers.find(s => s.id === supplierId);
    setForm(f => ({ ...f, supplier_id: supplierId, supplier_name: s?.name || '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const entry = await base44.entities.HazMatRegistry.create({ ...form, tenant_id: tenantId });
    navigate(`/register/${entry.id}`);
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/admin"><Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" /> Back</Button></Link>
        <h1 className="text-xl font-bold font-space-grotesk">New Registry Entry</h1>
      </div>

      {/* Duplicate Warning */}
      {duplicates.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-yellow-700 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-yellow-800">Possible Duplicates Detected</p>
                <p className="text-xs text-yellow-700 mt-1">The following existing entries may be duplicates:</p>
                <div className="mt-2 space-y-1">
                  {duplicates.map(d => (
                    <Link key={d.id} to={`/register/${d.id}`} target="_blank">
                      <div className="text-xs text-yellow-800 underline flex items-center gap-1">
                        <FlaskConical size={11} /> {d.product_name} — {d.site_name}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Product & Site</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Link to Existing Product (optional)</Label>
              <Select onValueChange={handleProductSelect}>
                <SelectTrigger><SelectValue placeholder="Search products..." /></SelectTrigger>
                <SelectContent>
                  {products.map(p => <SelectItem key={p.id} value={p.id}>{p.product_name} — {p.supplier_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Product Name *</Label>
              <Input value={form.product_name} onChange={e => setForm(f => ({...f, product_name: e.target.value}))} required />
            </div>
            <div>
              <Label>Site *</Label>
              <Select value={form.site_id} onValueChange={handleSiteSelect}>
                <SelectTrigger><SelectValue placeholder="Select site..." /></SelectTrigger>
                <SelectContent>{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Supplier</Label>
              <Select value={form.supplier_id} onValueChange={handleSupplierSelect}>
                <SelectTrigger><SelectValue placeholder="Select supplier..." /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Department</Label><Input value={form.department} onChange={e => setForm(f => ({...f, department: e.target.value}))} /></div>
              <div><Label>Contractor</Label><Input value={form.contractor} onChange={e => setForm(f => ({...f, contractor: e.target.value}))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>ERP Number</Label><Input value={form.erp_number} onChange={e => setForm(f => ({...f, erp_number: e.target.value}))} /></div>
              <div><Label>Vehicle Reg.</Label><Input value={form.vehicle_registration} onChange={e => setForm(f => ({...f, vehicle_registration: e.target.value}))} /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Storage & Risk</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Storage Location</Label><Input value={form.storage_location} onChange={e => setForm(f => ({...f, storage_location: e.target.value}))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Quantity</Label><Input value={form.storage_quantity} onChange={e => setForm(f => ({...f, storage_quantity: e.target.value}))} /></div>
              <div><Label>Unit</Label><Input value={form.storage_unit} placeholder="L, kg, m³..." onChange={e => setForm(f => ({...f, storage_unit: e.target.value}))} /></div>
            </div>
            <div>
              <Label>Risk Rating</Label>
              <Select value={form.risk_rating} onValueChange={v => setForm(f => ({...f, risk_rating: v}))}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {['Low', 'Medium', 'High', 'Critical'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Risk Description</Label><Input value={form.risk_description} onChange={e => setForm(f => ({...f, risk_description: e.target.value}))} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="top25" checked={form.is_top_25} onChange={e => setForm(f => ({...f, is_top_25: e.target.checked}))} className="w-4 h-4" />
              <Label htmlFor="top25" className="cursor-pointer">Include in Top 25 List</Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Support & Emergency Contact</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contact Name</Label><Input value={form.support_contact_name} onChange={e => setForm(f => ({...f, support_contact_name: e.target.value}))} /></div>
              <div><Label>Contact Phone</Label><Input value={form.support_contact_phone} onChange={e => setForm(f => ({...f, support_contact_phone: e.target.value}))} /></div>
            </div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} /></div>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating...' : 'Create Registry Entry'}
        </Button>
      </form>
    </div>
  );
}