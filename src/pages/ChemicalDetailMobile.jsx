import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Phone, Mail, AlertCircle, FlaskConical, Loader2 } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import TenantGate from '@/components/shared/TenantGate';
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileSection from '@/components/mobile/MobileSection';
import RiskChip from '@/components/mobile/RiskChip';
import EmergencyButton from '@/components/mobile/EmergencyButton';
import MobileBottomNav from '@/components/mobile/MobileBottomNav';
import { useOfflineData } from '@/lib/useOfflineData';
import { getCachedImage } from '@/lib/imageCache';
import NFPADiamond from '@/components/shared/NFPADiamond';
import GHSPictogram from '@/components/shared/GHSPictogram';
import { cn } from '@/lib/utils';

function ChemicalDetailInner() {
  const { id } = useParams();
  const { tenantId } = useTenant();
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);

  const { data: products } = useOfflineData(
    tenantId, 'ProductMaster',
    () => base44.entities.ProductMaster.filter({ tenant_id: tenantId })
  );
  const { data: hazards } = useOfflineData(
    tenantId, 'Hazard',
    () => base44.entities.Hazard.filter({ tenant_id: tenantId })
  );
  const { data: compositions } = useOfflineData(
    tenantId, 'Composition',
    () => base44.entities.Composition.filter({ tenant_id: tenantId })
  );
  const { data: sdsSections } = useOfflineData(
    tenantId, 'SDSSection',
    () => base44.entities.SDSSection.filter({ tenant_id: tenantId })
  );

  useEffect(() => {
    const fetchEntry = async () => {
      try {
        const data = await base44.entities.HazMatRegistry.get(id);
        setEntry(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchEntry();
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-3">
        <Loader2 size={32} className="animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading material...</p>
      </div>
    </div>
  );

  if (!entry) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-muted-foreground">Material not found</p>
    </div>
  );

  const product = products.find(p => p.file_sha256 === entry.file_sha256);
  const itemHazards = hazards.filter(h => h.file_sha256 === entry.file_sha256);
  const itemCompositions = compositions.filter(c => c.file_sha256 === entry.file_sha256);
  const itemSections = sdsSections.filter(s => s.file_sha256 === entry.file_sha256);

  const getPictogram = () => {
    const picUrl = product?.pictogram_url || itemHazards[0]?.pictogram_url || entry.pictogram_url;
    return picUrl ? getCachedImage(tenantId, picUrl) : null;
  };

  const picUrl = getPictogram();

  return (
    <div className="bg-background min-h-screen pb-20 md:pb-0">
      <MobileHeader 
        title={entry.product_name}
        rightContent={<RiskChip rating={entry.Risk_Rating_Desc} size="md" />}
      />

      <div className="p-3 md:p-6 space-y-3 md:space-y-4">
        
        {/* Overview Section */}
        <MobileSection title="Overview" defaultOpen={true}>
          <div className="space-y-4">
            {/* Pictogram & Risk */}
            {picUrl && (
              <div className="flex gap-3">
                <img src={picUrl} alt="hazard" className="w-16 h-16 object-contain" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Risk Level</p>
                  <div className="mt-2">
                    <RiskChip rating={entry.Risk_Rating_Desc} size="lg" />
                  </div>
                </div>
              </div>
            )}

            {/* Supplier & Site */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Supplier</p>
                <p className="text-sm font-semibold mt-1">{entry.supplier_name || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Site</p>
                <p className="text-sm font-semibold mt-1">{entry.Site || '—'}</p>
              </div>
            </div>

            {/* Key Details */}
            {entry.ERP_Number && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">ERP Number</p>
                <p className="text-sm font-semibold mt-1">{entry.ERP_Number}</p>
              </div>
            )}

            {entry.Top_25_List === 'Yes' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
                ⚠️ Listed on Top 25 Priority Substances
              </div>
            )}
          </div>
        </MobileSection>

        {/* Hazards Section */}
        {itemHazards.length > 0 && (
          <MobileSection title={`Hazards (${itemHazards.length})`} defaultOpen={true}>
            <div className="space-y-3">
              {itemHazards.map((hazard, idx) => (
                <div key={idx} className="border-l-4 border-red-500 pl-3 py-2 bg-red-50/30 rounded">
                  {hazard.signal_word && (
                    <p className="text-xs font-bold text-red-700 mb-1">{hazard.signal_word}</p>
                  )}
                  <p className="text-xs text-foreground">{hazard.statements}</p>
                  {hazard.pictogram_url && (
                    <img src={getCachedImage(tenantId, hazard.pictogram_url) || hazard.pictogram_url} 
                         alt="pictogram" 
                         className="w-10 h-10 mt-2" />
                  )}
                </div>
              ))}
            </div>
          </MobileSection>
        )}

        {/* Composition Section */}
        {itemCompositions.length > 0 && (
          <MobileSection title={`Composition (${itemCompositions.length})`} defaultOpen={false}>
            <div className="space-y-3">
              {itemCompositions.map((comp, idx) => (
                <div key={idx} className="border-l-4 border-blue-500 pl-3 py-2 bg-blue-50/30 rounded space-y-1">
                  <p className="text-sm font-semibold">{comp.chemical_name}</p>
                  {comp.cas_number && (
                    <p className="text-xs text-muted-foreground">CAS: {comp.cas_number}</p>
                  )}
                  {comp.conc_value && (
                    <p className="text-xs text-muted-foreground">Concentration: {comp.conc_value}%</p>
                  )}
                  {comp.conc_min && comp.conc_max && (
                    <p className="text-xs text-muted-foreground">Range: {comp.conc_min}% - {comp.conc_max}%</p>
                  )}
                </div>
              ))}
            </div>
          </MobileSection>
        )}

        {/* NFPA Diamond */}
        {product && (
          <MobileSection title="NFPA Classification" defaultOpen={false}>
            <div className="flex justify-center py-4">
              <NFPADiamond 
                health={product.NFPA_H}
                flammability={product.NFPA_F}
                reactivity={product.NFPA_R}
              />
            </div>
          </MobileSection>
        )}

        {/* SDS Sections */}
        {itemSections.length > 0 && (
          <MobileSection title={`SDS (${itemSections.length} sections)`} defaultOpen={false}>
            <div className="space-y-3 text-sm">
              {itemSections.filter(s => s.text && !s.abstained).map((section, idx) => (
                <div key={idx} className="border-l-4 border-purple-500 pl-3 py-2 bg-purple-50/30 rounded">
                  <p className="text-xs font-semibold text-purple-700 mb-1">Section {section.section_number}</p>
                  <p className="text-xs text-foreground line-clamp-3">{section.text}</p>
                </div>
              ))}
            </div>
          </MobileSection>
        )}

        {/* Responsible Department */}
        {entry.Responsible_Department && (
          <MobileSection title="Department & Contact" defaultOpen={false}>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Responsible Department</p>
                <p className="text-sm font-semibold mt-1">{entry.Responsible_Department}</p>
              </div>
              {entry.Onsite_Contractor && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Onsite Contractor</p>
                  <p className="text-sm font-semibold mt-1">{entry.Onsite_Contractor}</p>
                </div>
              )}
            </div>
          </MobileSection>
        )}

        {/* Emergency & Documents */}
        <MobileSection title="Emergency & Documents" defaultOpen={false}>
          <div className="space-y-3">
            {entry.Fasttrack_Supplier_Contact && (
              <EmergencyButton
                type="phone"
                value={entry.Fasttrack_Supplier_Contact}
                label="Supplier Contact"
              />
            )}
            {entry.Fasttrack_SDS && (
              <a href={entry.Fasttrack_SDS} target="_blank" rel="noopener noreferrer" className="block">
                <button className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2">
                  📄 View SDS PDF
                </button>
              </a>
            )}
          </div>
        </MobileSection>

        {/* Notes */}
        {entry.notes && (
          <MobileSection title="Notes" defaultOpen={false}>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{entry.notes}</p>
          </MobileSection>
        )}
      </div>

      <MobileBottomNav />
    </div>
  );
}

export default function ChemicalDetail() {
  return <TenantGate><ChemicalDetailInner /></TenantGate>;
}