import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { FileText, Download, Star, Plus } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import TenantGate from '@/components/shared/TenantGate';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/AuthContext';

const DOC_TYPES = ['ERP', 'SHEQ Policy', 'HazMat Manual', 'RA Doc', 'SDS PDF', 'Image', 'Other'];

const TYPE_COLORS = {
  'ERP': 'bg-red-100 text-red-800 border-red-200',
  'SHEQ Policy': 'bg-blue-100 text-blue-800 border-blue-200',
  'HazMat Manual': 'bg-purple-100 text-purple-800 border-purple-200',
  'RA Doc': 'bg-orange-100 text-orange-800 border-orange-200',
  'SDS PDF': 'bg-green-100 text-green-800 border-green-200',
  'Image': 'bg-gray-100 text-gray-800 border-gray-200',
  'Other': 'bg-gray-100 text-gray-600 border-gray-200',
};

function UploadDialog({ sites, onSuccess }) {
  const [form, setForm] = useState({ title: '', document_type: 'Other', site_id: '', version: '', description: '', is_offline_priority: false });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    let file_url = '';
    let filename = '';
    if (file) {
      const res = await base44.integrations.Core.UploadFile({ file });
      file_url = res.file_url;
      filename = file.name;
    }
    const site = sites.find(s => s.id === form.site_id);
    await base44.entities.Document.create({
      ...form,
      tenant_id: tenantId,
      site_name: site?.name || '',
      file_url,
      filename,
    });
    setLoading(false);
    setOpen(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5"><Plus size={14} /> Upload Document</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} required /></div>
          <div>
            <Label>Type</Label>
            <Select value={form.document_type} onValueChange={v => setForm(p => ({...p, document_type: v}))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Site</Label>
            <Select value={form.site_id} onValueChange={v => setForm(p => ({...p, site_id: v}))}>
              <SelectTrigger><SelectValue placeholder="Select site..." /></SelectTrigger>
              <SelectContent>{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Version</Label><Input value={form.version} onChange={e => setForm(p => ({...p, version: e.target.value}))} placeholder="e.g. v2.1" /></div>
          <div><Label>Description</Label><Input value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} /></div>
          <div>
            <Label>File</Label>
            <input type="file" className="w-full text-sm border border-border rounded-lg p-2 mt-1" onChange={e => setFile(e.target.files[0])} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="offline" checked={form.is_offline_priority} onChange={e => setForm(p => ({...p, is_offline_priority: e.target.checked}))} />
            <Label htmlFor="offline" className="cursor-pointer">Mark as offline priority</Label>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Uploading...' : 'Upload'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DocumentsInner() {
  const [docs, setDocs] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [filterSite, setFilterSite] = useState('all');
  const [filterOffline, setFilterOffline] = useState(false);
  const { user } = useAuth();
  const { tenantId, canEdit } = useTenant();
  const isAdmin = canEdit;

  const load = () => {
    if (!tenantId) return;
    Promise.all([
      base44.entities.Document.filter({ tenant_id: tenantId }, '-created_date', 200),
      base44.entities.Site.filter({ tenant_id: tenantId })
    ]).then(([d, s]) => {
      setDocs(d.filter(doc => doc.is_active !== false));
      setSites(s);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, [tenantId]);

  const filtered = docs.filter(d => {
    const matchType = filterType === 'all' || d.document_type === filterType;
    const matchSite = filterSite === 'all' || d.site_id === filterSite;
    const matchOffline = !filterOffline || d.is_offline_priority;
    return matchType && matchSite && matchOffline;
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-space-grotesk">Document Library</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} documents</p>
        </div>
        {isAdmin && <UploadDialog sites={sites} onSuccess={load} />}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="All Types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterSite} onValueChange={setFilterSite}>
            <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="All Sites" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sites</SelectItem>
              {sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant={filterOffline ? 'default' : 'outline'} size="sm" className="h-8 gap-1.5" onClick={() => setFilterOffline(!filterOffline)}>
            <Star size={13} /> Offline Priority
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.length === 0 ? (
            <div className="col-span-2 text-center py-12 text-muted-foreground">
              <FileText size={40} className="mx-auto mb-3 opacity-30" />
              <p>No documents found</p>
            </div>
          ) : (
            filtered.map(doc => (
              <Card key={doc.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText size={18} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-1.5 flex-wrap">
                      <p className="font-semibold text-sm">{doc.title}</p>
                      {doc.is_offline_priority && <Star size={12} className="text-yellow-500 mt-0.5 shrink-0" />}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium border ${TYPE_COLORS[doc.document_type] || TYPE_COLORS.Other}`}>
                        {doc.document_type}
                      </span>
                      {doc.site_name && <span className="text-xs text-muted-foreground">{doc.site_name}</span>}
                      {doc.version && <span className="text-xs text-muted-foreground">v{doc.version}</span>}
                    </div>
                    {doc.description && <p className="text-xs text-muted-foreground mt-1 truncate">{doc.description}</p>}
                    {doc.file_url && (
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:underline">
                        <Download size={12} /> Download
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function Documents() {
  return <TenantGate><DocumentsInner /></TenantGate>;
}