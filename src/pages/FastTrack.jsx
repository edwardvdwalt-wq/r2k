import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Zap, Camera, CheckCircle2, AlertTriangle } from 'lucide-react';
import TenantGate from '@/components/shared/TenantGate';

const REQUIRED_PHOTOS = [
  { key: 'substance_photo_1_url', label: 'Substance Photo 1' },
  { key: 'substance_photo_2_url', label: 'Substance Photo 2' },
  { key: 'vehicle_license_photo_url', label: 'Vehicle License Photo' },
];

function FastTrackInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { tenantId, tenant, tenantUser } = useTenant();

  const [form, setForm] = useState({
    supplier_name: '',
    supplier_contact_number: '',
    substance_name: location.state?.substanceName || '',
    notes: '',
    site_name: '',
  });
  const [photos, setPhotos] = useState({
    substance_photo_1_url: null,
    substance_photo_2_url: null,
    vehicle_license_photo_url: null,
  });
  const [photoFiles, setPhotoFiles] = useState({
    substance_photo_1_url: null,
    substance_photo_2_url: null,
    vehicle_license_photo_url: null,
  });
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handlePhotoChange = (key, file) => {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setPhotos(p => ({ ...p, [key]: previewUrl }));
    setPhotoFiles(f => ({ ...f, [key]: file }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!photoFiles.substance_photo_1_url || !photoFiles.substance_photo_2_url || !photoFiles.vehicle_license_photo_url) {
      setError('All three photos are required.');
      return;
    }

    setUploading(true);
    try {
      // Upload all photos in parallel
      const [r1, r2, r3] = await Promise.all([
        base44.integrations.Core.UploadFile({ file: photoFiles.substance_photo_1_url }),
        base44.integrations.Core.UploadFile({ file: photoFiles.substance_photo_2_url }),
        base44.integrations.Core.UploadFile({ file: photoFiles.vehicle_license_photo_url }),
      ]);

      await base44.functions.invoke('submitFastTrack', {
        tenant_id: tenantId,
        site_id: tenantUser?.primary_site_id || '',
        site_name: form.site_name || tenant?.name || '',
        supplier_name: form.supplier_name,
        supplier_contact_number: form.supplier_contact_number,
        substance_name: form.substance_name,
        substance_photo_1_url: r1.file_url,
        substance_photo_2_url: r2.file_url,
        vehicle_license_photo_url: r3.file_url,
        notes: form.notes,
      });

      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Submission failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (submitted) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center space-y-4 pt-16">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 size={32} className="text-green-600" />
        </div>
        <h2 className="text-xl font-bold font-space-grotesk">Fast Track Submitted</h2>
        <p className="text-muted-foreground text-sm">
          Your request has been submitted and notifications have been sent to the site admin and HazMat support team. You will receive a copy at <strong>{user?.email}</strong>.
        </p>
        <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle size={12} className="inline mr-1 text-amber-600" />
          This substance has <strong>NOT</strong> been added to the live register. A Site Admin must review and convert this request.
        </p>
        <Button onClick={() => navigate('/register')} className="w-full">Back to Register</Button>
        <Button variant="outline" onClick={() => { setSubmitted(false); setForm({ supplier_name: '', supplier_contact_number: '', substance_name: '', notes: '', site_name: '' }); setPhotos({}); setPhotoFiles({}); }} className="w-full">Submit Another</Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/register')}>
          <ArrowLeft size={16} className="mr-1" /> Back
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
          <Zap size={20} className="text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-space-grotesk">Fast Track Request</h1>
          <p className="text-sm text-muted-foreground">Substance not found in register — submit for review</p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
        <AlertTriangle size={14} className="inline mr-1" />
        Fast Track creates a <strong>request only</strong>. The substance will not be added to the live register until reviewed by a Site Admin.
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Substance Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Substance Name *</Label>
              <Input value={form.substance_name} onChange={e => setForm(p => ({ ...p, substance_name: e.target.value }))} placeholder="e.g. Hydrochloric Acid" required />
            </div>
            <div>
              <Label>Supplier Name *</Label>
              <Input value={form.supplier_name} onChange={e => setForm(p => ({ ...p, supplier_name: e.target.value }))} placeholder="e.g. Acme Chemicals" required />
            </div>
            <div>
              <Label>Supplier Contact Number *</Label>
              <Input value={form.supplier_contact_number} onChange={e => setForm(p => ({ ...p, supplier_contact_number: e.target.value }))} placeholder="+27 11 000 0000" required />
            </div>
            <div>
              <Label>Site Name</Label>
              <Input value={form.site_name} onChange={e => setForm(p => ({ ...p, site_name: e.target.value }))} placeholder="e.g. Main Warehouse" />
            </div>
            <div>
              <Label>Additional Notes</Label>
              <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any additional context..." />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Camera size={14} /> Required Photos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {REQUIRED_PHOTOS.map(({ key, label }) => (
              <div key={key}>
                <Label>{label} *</Label>
                <div className="mt-1.5 space-y-2">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="w-full text-sm border border-border rounded-lg p-2"
                    onChange={e => handlePhotoChange(key, e.target.files[0])}
                    required
                  />
                  {photos[key] && (
                    <img src={photos[key]} alt={label} className="h-32 rounded-lg object-cover border border-border" />
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-3">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={uploading}>
          {uploading ? (
            <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Uploading & Submitting…</span>
          ) : (
            <span className="flex items-center gap-2"><Zap size={15} /> Submit Fast Track Request</span>
          )}
        </Button>
      </form>
    </div>
  );
}

export default function FastTrack() {
  return <TenantGate><FastTrackInner /></TenantGate>;
}