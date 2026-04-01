import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Building2, Plus, ChevronRight, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/AuthContext';

// ─── Tenant List ────────────────────────────────────────────────────────────
function TenantList() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Tenant.list().then(t => { setTenants(t); setLoading(false); });
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-space-grotesk">Tenant Management</h1>
          <p className="text-muted-foreground text-sm">Manage corporate customers (tenants)</p>
        </div>
        <Link to="/admin/tenants/new">
          <Button size="sm"><Plus size={14} className="mr-1" /> New Tenant</Button>
        </Link>
      </div>

      {loading ? (
        <div className="py-8 text-center text-muted-foreground">Loading...</div>
      ) : tenants.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 size={40} className="mx-auto mb-3 opacity-30" />
          <p>No tenants yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tenants.map(t => (
            <Link key={t.id} to={`/admin/tenants/${t.id}`}>
              <div className="bg-card border border-border rounded-xl px-4 py-3.5 flex items-center gap-4 hover:border-primary/40 hover:shadow-sm transition-all">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 size={16} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{t.slug} {t.industry && `· ${t.industry}`} {t.country && `· ${t.country}`}</p>
                </div>
                <Badge variant={t.is_active !== false ? 'default' : 'secondary'} className="text-xs">
                  {t.is_active !== false ? 'Active' : 'Inactive'}
                </Badge>
                <ChevronRight size={14} className="text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tenant Form ────────────────────────────────────────────────────────────
function TenantForm() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const isNew = tenantId === 'new';
  const [form, setForm] = useState({
    name: '', slug: '', industry: '', country: '', primary_contact_name: '',
    primary_contact_email: '', max_sites: 50, is_active: true, notes: ''
  });
  const [tenantUsers, setTenantUsers] = useState([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('read_only');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isNew) {
      base44.entities.Tenant.filter({ id: tenantId }).then(([t]) => { if (t) setForm(t); });
      base44.entities.TenantUser.filter({ tenant_id: tenantId }).then(setTenantUsers);
    }
  }, [tenantId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    if (isNew) await base44.entities.Tenant.create(form);
    else await base44.entities.Tenant.update(tenantId, form);
    navigate('/admin/tenants');
  };

  const handleAddUser = async () => {
    if (!newUserEmail.trim()) return;
    await base44.entities.TenantUser.create({
      tenant_id: tenantId,
      tenant_name: form.name,
      user_email: newUserEmail.trim(),
      tenant_role: newUserRole,
      is_active: true,
    });
    setNewUserEmail('');
    const updated = await base44.entities.TenantUser.filter({ tenant_id: tenantId });
    setTenantUsers(updated);
  };

  const handleRemoveUser = async (tuId) => {
    await base44.entities.TenantUser.delete(tuId);
    setTenantUsers(prev => prev.filter(u => u.id !== tuId));
  };

  const slugify = (val) => val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/admin/tenants"><Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" /> Back</Button></Link>
        <h1 className="text-xl font-bold font-space-grotesk">{isNew ? 'New Tenant' : 'Edit Tenant'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Organisation Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Organisation Name *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: isNew ? slugify(e.target.value) : f.slug }))}
                required
              />
            </div>
            <div>
              <Label>Slug (unique identifier) *</Label>
              <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: slugify(e.target.value) }))} placeholder="e.g. acme-mining" required />
              <p className="text-xs text-muted-foreground mt-1">Lowercase, hyphens only. Cannot be changed after creation.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Industry</Label><Input value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} placeholder="e.g. Mining" /></div>
              <div><Label>Country</Label><Input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Primary Contact</Label><Input value={form.primary_contact_name} onChange={e => setForm(f => ({ ...f, primary_contact_name: e.target.value }))} /></div>
              <div><Label>Contact Email</Label><Input type="email" value={form.primary_contact_email} onChange={e => setForm(f => ({ ...f, primary_contact_email: e.target.value }))} /></div>
            </div>
            <div><Label>Max Sites</Label><Input type="number" value={form.max_sites} onChange={e => setForm(f => ({ ...f, max_sites: Number(e.target.value) }))} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="active" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4" />
              <Label htmlFor="active" className="cursor-pointer">Active tenant</Label>
            </div>
          </CardContent>
        </Card>
        <Button type="submit" className="w-full" disabled={saving}>{saving ? 'Saving...' : isNew ? 'Create Tenant' : 'Save Changes'}</Button>
      </form>

      {/* User management (only for existing tenants) */}
      {!isNew && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Users size={14} /> Tenant Users</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="user@email.com" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} className="flex-1" />
              <Select value={newUserRole} onValueChange={setNewUserRole}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="site_admin">Site Admin</SelectItem>
                  <SelectItem value="coordinator">Coordinator</SelectItem>
                  <SelectItem value="read_only">Read Only</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" onClick={handleAddUser} size="sm">Add</Button>
            </div>
            {tenantUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">No users assigned yet.</p>
            ) : (
              <div className="space-y-1">
                {tenantUsers.map(u => (
                  <div key={u.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{u.user_email}</p>
                      <Badge variant="outline" className="text-xs mt-0.5">{u.tenant_role}</Badge>
                    </div>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleRemoveUser(u.id)}>Remove</Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Route Switch ────────────────────────────────────────────────────────────
export default function ManageTenants() {
  const { tenantId } = useParams();
  const { user } = useAuth();

  if (user?.role !== 'admin') {
    return <div className="p-6 text-center text-muted-foreground">Super admin access required.</div>;
  }

  return tenantId ? <TenantForm /> : <TenantList />;
}