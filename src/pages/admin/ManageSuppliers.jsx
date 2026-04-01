import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ManageSuppliers() {
  const { supplierId } = useParams();
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const isNew = supplierId === 'new' || !supplierId;
  const [form, setForm] = useState({
    name: '', contact_name: '', contact_phone: '', contact_email: '',
    address: '', country: '', emergency_phone: '', is_active: true
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isNew) {
      base44.entities.Supplier.filter({ id: supplierId }).then(([s]) => { if (s) setForm(s); });
    }
  }, [supplierId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    if (isNew) await base44.entities.Supplier.create({ ...form, tenant_id: tenantId });
    else await base44.entities.Supplier.update(supplierId, form);
    navigate('/admin');
  };

  return (
    <div className="p-4 md:p-6 max-w-xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/admin"><Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" /> Back</Button></Link>
        <h1 className="text-xl font-bold font-space-grotesk">{isNew ? 'New Supplier' : 'Edit Supplier'}</h1>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardContent className="pt-5 space-y-3">
            <div><Label>Supplier Name *</Label><Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} required /></div>
            <div><Label>Country</Label><Input value={form.country} onChange={e => setForm(f => ({...f, country: e.target.value}))} /></div>
            <div><Label>Address</Label><Input value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contact Name</Label><Input value={form.contact_name} onChange={e => setForm(f => ({...f, contact_name: e.target.value}))} /></div>
              <div><Label>Contact Phone</Label><Input value={form.contact_phone} onChange={e => setForm(f => ({...f, contact_phone: e.target.value}))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contact Email</Label><Input value={form.contact_email} onChange={e => setForm(f => ({...f, contact_email: e.target.value}))} /></div>
              <div><Label>Emergency Phone</Label><Input value={form.emergency_phone} onChange={e => setForm(f => ({...f, emergency_phone: e.target.value}))} /></div>
            </div>
          </CardContent>
        </Card>
        <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Saving...' : isNew ? 'Create Supplier' : 'Save Changes'}</Button>
      </form>
    </div>
  );
}