import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { ArrowLeft, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function ManageProducts() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const isNew = productId === 'new' || !productId;
  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState({
    product_name: '', supplier_id: '', supplier_name: '', cas_number: '', product_code: '',
    un_number: '', signal_word: '', sds_version: '', sds_revision_date: '',
    nfpa_health: '', nfpa_flammability: '', nfpa_reactivity: '', nfpa_special: '',
    default_risk_rating: '', is_current: true, notes: '', sds_pdf_url: '', sds_filename: ''
  });
  const [sdsFile, setSdsFile] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    base44.entities.Supplier.list().then(setSuppliers);
    if (!isNew) {
      base44.entities.ProductMaster.filter({ id: productId }).then(([p]) => { if (p) setForm(p); });
    }
  }, [productId]);

  const handleSupplierSelect = (id) => {
    const s = suppliers.find(s => s.id === id);
    setForm(f => ({ ...f, supplier_id: id, supplier_name: s?.name || '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    let updatedForm = { ...form };
    if (sdsFile) {
      const res = await base44.integrations.Core.UploadFile({ file: sdsFile });
      updatedForm.sds_pdf_url = res.file_url;
      updatedForm.sds_filename = sdsFile.name;
      updatedForm.sds_ingest_date = new Date().toISOString().split('T')[0];
    }
    if (isNew) await base44.entities.ProductMaster.create({ ...updatedForm, tenant_id: tenantId });
    else await base44.entities.ProductMaster.update(productId, updatedForm);
    navigate('/admin');
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/admin"><Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" /> Back</Button></Link>
        <h1 className="text-xl font-bold font-space-grotesk">{isNew ? 'New Product / SDS' : 'Edit Product'}</h1>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Product Identity</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Product Name *</Label><Input value={form.product_name} onChange={e => setForm(f => ({...f, product_name: e.target.value}))} required /></div>
            <div>
              <Label>Supplier</Label>
              <Select value={form.supplier_id} onValueChange={handleSupplierSelect}>
                <SelectTrigger><SelectValue placeholder="Select supplier..." /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>CAS Number</Label><Input value={form.cas_number} onChange={e => setForm(f => ({...f, cas_number: e.target.value}))} /></div>
              <div><Label>Product Code</Label><Input value={form.product_code} onChange={e => setForm(f => ({...f, product_code: e.target.value}))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>UN Number</Label><Input value={form.un_number} onChange={e => setForm(f => ({...f, un_number: e.target.value}))} /></div>
              <div><Label>Signal Word</Label>
                <Select value={form.signal_word} onValueChange={v => setForm(f => ({...f, signal_word: v}))}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Danger">Danger</SelectItem>
                    <SelectItem value="Warning">Warning</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Default Risk Rating</Label>
              <Select value={form.default_risk_rating} onValueChange={v => setForm(f => ({...f, default_risk_rating: v}))}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>{['Low', 'Medium', 'High', 'Critical'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">NFPA Classification</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-4 gap-3">
            {[['Health', 'nfpa_health'], ['Flammability', 'nfpa_flammability'], ['Reactivity', 'nfpa_reactivity']].map(([label, key]) => (
              <div key={key}>
                <Label>{label} (0-4)</Label>
                <Input type="number" min="0" max="4" value={form[key]} onChange={e => setForm(f => ({...f, [key]: e.target.value}))} />
              </div>
            ))}
            <div><Label>Special</Label><Input value={form.nfpa_special} placeholder="W, OX..." onChange={e => setForm(f => ({...f, nfpa_special: e.target.value}))} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">SDS Document</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>SDS Version</Label><Input value={form.sds_version} onChange={e => setForm(f => ({...f, sds_version: e.target.value}))} /></div>
              <div><Label>Revision Date</Label><Input type="date" value={form.sds_revision_date} onChange={e => setForm(f => ({...f, sds_revision_date: e.target.value}))} /></div>
            </div>
            <div>
              <Label>Upload SDS PDF</Label>
              <input type="file" accept=".pdf" className="w-full text-sm border border-border rounded-lg p-2 mt-1" onChange={e => setSdsFile(e.target.files[0])} />
            </div>
            {form.sds_pdf_url && (
              <a href={form.sds_pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">View current SDS</a>
            )}
            <div className="flex items-center gap-2">
              <input type="checkbox" id="current" checked={form.is_current} onChange={e => setForm(f => ({...f, is_current: e.target.checked}))} className="w-4 h-4" />
              <Label htmlFor="current" className="cursor-pointer">Mark as current version</Label>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Saving...' : isNew ? 'Create Product' : 'Save Changes'}</Button>
      </form>
    </div>
  );
}