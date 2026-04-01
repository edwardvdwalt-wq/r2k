import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { useRBAC } from '@/lib/useRBAC';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Zap, Shield, CheckCircle2, XCircle, Eye, ClipboardList } from 'lucide-react';
import TenantGate from '@/components/shared/TenantGate';
import { useAuth } from '@/lib/AuthContext';

const STATUS_COLORS = {
  'Submitted':            'bg-blue-100 text-blue-800 border-blue-200',
  'Under Review':         'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Approved':             'bg-green-100 text-green-800 border-green-200',
  'Rejected':             'bg-red-100 text-red-800 border-red-200',
  'Converted to Register':'bg-purple-100 text-purple-800 border-purple-200',
};

function RequestCard({ req, onUpdate }) {
  const { user } = useAuth();
  const [updating, setUpdating] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const update = async (status) => {
    setUpdating(true);
    await base44.entities.FastTrackRequest.update(req.id, {
      status,
      reviewed_by_email: user.email,
      reviewed_at: new Date().toISOString(),
    });
    setUpdating(false);
    onUpdate();
  };

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <Zap size={16} className="text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-sm">{req.substance_name}</p>
              <p className="text-xs text-muted-foreground">{req.supplier_name} · {req.site_name || req.tenant_id}</p>
              <p className="text-xs text-muted-foreground">By {req.submitted_by_name || req.submitted_by_email}</p>
            </div>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded border font-medium shrink-0 ${STATUS_COLORS[req.status] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
            {req.status}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{new Date(req.created_date).toLocaleDateString()}</span>
          <span>·</span>
          <span>Contact: {req.supplier_contact_number}</span>
        </div>

        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2" onClick={() => setExpanded(!expanded)}>
          <Eye size={12} /> {expanded ? 'Hide' : 'View'} Photos & Details
        </Button>

        {expanded && (
          <div className="space-y-3 pt-2 border-t border-border">
            {req.notes && <p className="text-sm text-muted-foreground"><strong>Notes:</strong> {req.notes}</p>}
            <div className="flex flex-wrap gap-3">
              {[req.substance_photo_1_url, req.substance_photo_2_url].map((url, i) => url && (
                <div key={i} className="space-y-1">
                  <p className="text-xs text-muted-foreground">Substance {i + 1}</p>
                  <img src={url} alt={`Substance ${i + 1}`} className="h-28 rounded-lg object-cover border border-border" />
                </div>
              ))}
              {req.vehicle_license_photo_url && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Vehicle License</p>
                  <img src={req.vehicle_license_photo_url} alt="Vehicle License" className="h-28 rounded-lg object-cover border border-border" />
                </div>
              )}
            </div>
          </div>
        )}

        {['Submitted', 'Under Review'].includes(req.status) && (
          <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={updating} onClick={() => update('Under Review')}>
              <ClipboardList size={12} /> Mark Under Review
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-green-700 border-green-300 hover:bg-green-50" disabled={updating} onClick={() => update('Approved')}>
              <CheckCircle2 size={12} /> Approve
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-700 border-red-300 hover:bg-red-50" disabled={updating} onClick={() => update('Rejected')}>
              <XCircle size={12} /> Reject
            </Button>
            <Button size="sm" className="h-7 text-xs gap-1 bg-purple-600 hover:bg-purple-700" disabled={updating} onClick={() => update('Converted to Register')}>
              <CheckCircle2 size={12} /> Convert to Register
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FastTrackReviewInner() {
  const { tenantId } = useTenant();
  const { canReviewFastTrack, isAppSuperAdmin } = useRBAC();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');

  const load = async () => {
    setLoading(true);
    const filter = isAppSuperAdmin ? {} : { tenant_id: tenantId };
    const rows = await base44.entities.FastTrackRequest.filter(filter, '-created_date', 200);
    setRequests(rows);
    setLoading(false);
  };

  useEffect(() => { if (tenantId || isAppSuperAdmin) load(); }, [tenantId]);

  if (!canReviewFastTrack) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full text-center">
        <Shield size={48} className="text-muted-foreground mb-4 opacity-40" />
        <h2 className="text-xl font-bold font-space-grotesk">Access Restricted</h2>
        <p className="text-muted-foreground text-sm mt-2">Only Site Admin or App Super Admin can review Fast Track requests.</p>
      </div>
    );
  }

  const filtered = filterStatus === 'all' ? requests : requests.filter(r => r.status === filterStatus);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-space-grotesk">Fast Track Review</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} request{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Submitted">Submitted</SelectItem>
            <SelectItem value="Under Review">Under Review</SelectItem>
            <SelectItem value="Approved">Approved</SelectItem>
            <SelectItem value="Rejected">Rejected</SelectItem>
            <SelectItem value="Converted to Register">Converted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Zap size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No Fast Track requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => <RequestCard key={req.id} req={req} onUpdate={load} />)}
        </div>
      )}
    </div>
  );
}

export default function FastTrackReview() {
  return <TenantGate><FastTrackReviewInner /></TenantGate>;
}