import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Phone, Mail, AlertCircle, Users } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import TenantGate from '@/components/shared/TenantGate';
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileSection from '@/components/mobile/MobileSection';
import MobileBottomNav from '@/components/mobile/MobileBottomNav';
import EmergencyButton from '@/components/mobile/EmergencyButton';
import { useOfflineData } from '@/lib/useOfflineData';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function EmergencyContactsInner() {
  const [selectedSite, setSelectedSite] = useState('');
  const { tenantId } = useTenant();

  const { data: sites } = useOfflineData(
    tenantId, 'Site',
    () => base44.entities.Site.filter({ tenant_id: tenantId, is_active: true })
  );

  const { data: suppliers } = useOfflineData(
    tenantId, 'Supplier',
    () => base44.entities.Supplier.filter({ tenant_id: tenantId, is_active: true })
  );

  const { data: registry } = useOfflineData(
    tenantId, 'HazMatRegistry',
    () => base44.entities.HazMatRegistry.filter({ tenant_id: tenantId, status: 'Active' })
  );

  // Set default site on load
  useEffect(() => {
    if (sites.length > 0 && !selectedSite) {
      setSelectedSite(sites[0].id);
    }
  }, [sites, selectedSite]);

  const currentSite = sites.find(s => s.id === selectedSite);

  // Get unique suppliers for materials at this site
  const siteMaterialSuppliers = currentSite
    ? [...new Set(
        registry
          .filter(r => r.Site === currentSite.name)
          .map(r => r.supplier_name)
          .filter(Boolean)
      )].map(name => suppliers.find(s => s.name === name)).filter(Boolean)
    : [];

  return (
    <div className="bg-background min-h-screen pb-20 md:pb-0">
      <MobileHeader
        title="Emergency Contacts"
        rightContent={
          <AlertCircle size={20} className="text-red-600" />
        }
      />

      <div className="p-3 md:p-6 space-y-4">
        {/* Site Selector */}
        {sites.length > 1 && (
          <Select value={selectedSite} onValueChange={setSelectedSite}>
            <SelectTrigger className="h-10 text-sm">
              <SelectValue placeholder="Select a site" />
            </SelectTrigger>
            <SelectContent>
              {sites.map(site => (
                <SelectItem key={site.id} value={site.id}>
                  {site.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Global Emergency Contacts */}
        <MobileSection
          title="Global Emergency"
          defaultOpen={true}
          icon={<AlertCircle size={16} className="text-red-600" />}
        >
          <div className="space-y-3">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
              <p className="text-xs font-semibold text-red-700">
                International Chemical Emergency
              </p>
              <div className="space-y-2">
                <EmergencyButton
                  type="phone"
                  value="+27 11 541 2626"
                  label="CHEMTREC (South Africa)"
                />
                <p className="text-xs text-red-600 px-2">
                  24/7 Chemical Transportation Emergency
                </p>
              </div>
            </div>
          </div>
        </MobileSection>

        {/* Site-Specific Contacts */}
        {currentSite && (
          <MobileSection
            title={`${currentSite.name} Contacts`}
            defaultOpen={true}
          >
            <div className="space-y-3">
              {/* Site Emergency Contact */}
              {currentSite.emergency_contact_name && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                  <p className="text-xs font-semibold text-blue-700">
                    Emergency Contact
                  </p>
                  <p className="text-sm font-medium">{currentSite.emergency_contact_name}</p>
                  {currentSite.emergency_contact_phone && (
                    <EmergencyButton
                      type="phone"
                      value={currentSite.emergency_contact_phone}
                      label="Call Emergency"
                    />
                  )}
                </div>
              )}

              {/* Site Coordinator */}
              {currentSite.site_coordinator_name && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-2">
                  <p className="text-xs font-semibold text-purple-700">
                    Site Coordinator
                  </p>
                  <p className="text-sm font-medium">{currentSite.site_coordinator_name}</p>
                  {currentSite.site_coordinator_email && (
                    <EmergencyButton
                      type="email"
                      value={currentSite.site_coordinator_email}
                      label="Email Coordinator"
                    />
                  )}
                </div>
              )}
            </div>
          </MobileSection>
        )}

        {/* Supplier Emergency Contacts */}
        {siteMaterialSuppliers.length > 0 && (
          <MobileSection
            title={`Material Suppliers (${siteMaterialSuppliers.length})`}
            defaultOpen={true}
          >
            <div className="space-y-3">
              {siteMaterialSuppliers.map(supplier => (
                <div
                  key={supplier.id}
                  className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-2"
                >
                  <p className="text-xs font-semibold text-orange-700">
                    {supplier.name}
                  </p>
                  {supplier.emergency_phone && (
                    <EmergencyButton
                      type="phone"
                      value={supplier.emergency_phone}
                      label="Supplier Emergency"
                    />
                  )}
                  {supplier.contact_phone && !supplier.emergency_phone && (
                    <EmergencyButton
                      type="phone"
                      value={supplier.contact_phone}
                      label="Supplier Contact"
                    />
                  )}
                  {supplier.contact_email && (
                    <EmergencyButton
                      type="email"
                      value={supplier.contact_email}
                      label="Supplier Email"
                    />
                  )}
                </div>
              ))}
            </div>
          </MobileSection>
        )}

        {/* Emergency Procedures */}
        <MobileSection
          title="Emergency Procedures"
          defaultOpen={false}
        >
          <div className="space-y-4 text-sm">
            <div className="space-y-2">
              <p className="font-semibold text-red-700">1. IMMEDIATE ACTION</p>
              <p className="text-muted-foreground text-xs">
                • Evacuate the area immediately
                • Call 911 or local emergency services
                • Alert all personnel in the vicinity
              </p>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-orange-700">2. NOTIFY SUPERVISORS</p>
              <p className="text-muted-foreground text-xs">
                • Contact Site Emergency Contact
                • Alert Site Coordinator
                • Provide chemical name & location
              </p>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-blue-700">3. SUPPLIER NOTIFICATION</p>
              <p className="text-muted-foreground text-xs">
                • Call supplier emergency line if available
                • Provide SDS (Safety Data Sheet)
                • Describe the incident & severity
              </p>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-purple-700">4. DOCUMENTATION</p>
              <p className="text-muted-foreground text-xs">
                • Report to SHEQ department
                • Document incident details
                • Preserve evidence/samples
              </p>
            </div>
          </div>
        </MobileSection>

        {/* Quick Info */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
          <p className="text-xs font-semibold text-amber-900 flex items-center gap-2">
            <AlertCircle size={14} /> Info
          </p>
          <p className="text-xs text-amber-700">
            Contacts are cached offline. Emergency numbers should be written down and posted visibly at your facility.
          </p>
        </div>
      </div>

      <MobileBottomNav />
    </div>
  );
}

export default function EmergencyContacts() {
  return <TenantGate><EmergencyContactsInner /></TenantGate>;
}