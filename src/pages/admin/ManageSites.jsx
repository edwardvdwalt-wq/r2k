import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ManageSites() {
  const { siteId } = useParams();
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const isNew = siteId === 'new' || !siteId;
  const [form, setForm] = useState({
    name: '', site_parent: '', location: '', region: '', is_active: true,
    emergency_contact_name: '', emergency_contact_phone: '',
    site_coordinator_name: '', site_coordinator_email: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isNew) {
      base44.entities.Site.filter({ id: siteId }).then(([s]) => { if (s) setForm(s); });
    }
  }, [siteId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    if (isNew) await base44.entities.Site.create({ ...form, tenant_id: tenantId });
    else await base44.entities.Site.update(siteId, form);
    navigate('/admin');
  };

  return (
    <div className="p-4 md:p-6 max-w-xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/admin"><Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" /> Back</Button></Link>
        <h1 className="text-xl font-bold font-space-grotesk">{isNew ? 'New Site' : 'Edit Site'}</h1>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Site Information</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Site Name *</Label><Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} required /></div>
            <div><Label>Parent Operation</Label><Input value={form.site_parent} onChange={e => setForm(f => ({...f, site_parent: e.target.value}))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Location</Label><Input value={form.location} onChange={e => setForm(f => ({...f, location: e.target.value}))} /></div>
              <div><Label>Region</Label><Input value={form.region} onChange={e => setForm(f => ({...f, region: e.target.value}))} /></div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="active" checked={form.is_active} onChange={e => setForm(f => ({...f, is_active: e.target.checked}))} className="w-4 h-4" />
              <Label htmlFor="active" className="cursor-pointer">Active Site</Label>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Contacts</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Emergency Contact</Label><Input value={form.emergency_contact_name} onChange={e => setForm(f => ({...f, emergency_contact_name: e.target.value}))} /></div>
              <div><Label>Emergency Phone</Label><Input value={form.emergency_contact_phone} onChange={e => setForm(f => ({...f, emergency_contact_phone: e.target.value}))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Coordinator Name</Label><Input value={form.site_coordinator_name} onChange={e => setForm(f => ({...f, site_coordinator_name: e.target.value}))} /></div>
              <div><Label>Coordinator Email</Label><Input value={form.site_coordinator_email} onChange={e => setForm(f => ({...f, site_coordinator_email: e.target.value}))} /></div>
            </div>
          </CardContent>
        </Card>
        <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Saving...' : isNew ? 'Create Site' : 'Save Changes'}</Button>
      </form>
    </div>
  );
}