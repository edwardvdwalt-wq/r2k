import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, FlaskConical, MapPin, Building2, Star, Phone, FileText, AlertTriangle, Package, WifiOff, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import RiskBadge from '@/components/shared/RiskBadge';
import NFPADiamond from '@/components/shared/NFPADiamond';
import { useIsOnline } from '@/lib/useOfflineData';
import { cacheRead } from '@/lib/offlineCache';
import { getCachedImage } from '@/lib/imageCache';
import { useTenant } from '@/lib/TenantContext';

const InfoRow = ({ label, value }) => value ? (
  <div className="flex gap-3 py-2 border-b border-border last:border-0">
    <span className="text-sm text-muted-foreground w-44 shrink-0">{label}</span>
    <span className="text-sm font-medium flex-1">{value}</span>
  </div>
) : null;

// Resolve image: use offline cache when available, fallback to direct URL
const CachedImg = ({ url, alt, className }) => {
  const { tenantId } = useTenant();
  const src = getCachedImage(tenantId, url);
  if (!src) return null;
  return <img src={src} alt={alt || ''} className={className} onError={e => { e.target.src = url; e.target.onError = null; }} />;
};

// Get risk rating color (matches register row color convention)
const getRiskColor = (rating) => {
  if (rating >= 8) return { bg: 'bg-hazard-critical', text: 'text-white' };
  if (rating >= 6) return { bg: 'bg-hazard-high', text: 'text-white' };
  if (rating >= 4) return { bg: 'bg-hazard-medium', text: 'text-white' };
  if (rating >= 2) return { bg: 'bg-hazard-low', text: 'text-white' };
  return { bg: 'bg-muted', text: 'text-foreground' };
};

// Open SDS document (offline-aware)
const openSDS = (url) => {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
};

const SDS_SECTION_HEADINGS = {
  1: 'SECTION 1: Identification of the product and of the company',
  2: 'SECTION 2: Hazard(s) identification',
  3: 'SECTION 3: Composition / Information on ingredients',
  4: 'SECTION 4: First-aid measures',
  5: 'SECTION 5: Fire-fighting measures',
  6: 'SECTION 6: Accidental release measures',
  7: 'SECTION 7: Handling and storage',
  8: 'SECTION 8: Exposure controls / Personal protection',
  9: 'SECTION 9: Physical and chemical properties',
  10: 'SECTION 10: Stability and reactivity',
  11: 'SECTION 11: Toxicological information',
  12: 'SECTION 12: Ecological information',
  13: 'SECTION 13: Disposal considerations',
  14: 'SECTION 14: Transportation information',
  15: 'SECTION 15: Regulatory information',
  16: 'SECTION 16: Other information',
};

export default function ChemicalDetail() {
  const { id } = useParams();
  const { tenantId } = useTenant();
  const online = useIsOnline();

  const [entry, setEntry] = useState(null);
  const [product, setProduct] = useState(null);
  const [hazards, setHazards] = useState([]);
  const [composition, setComposition] = useState([]);
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState('all');
  const [selectedChemical, setSelectedChemical] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !tenantId) return;
    loadData();
  }, [id, tenantId, online]);

  const loadData = async () => {
    setLoading(true);

    let reg = null;

    if (online) {
      const rows = await base44.entities.HazMatRegistry.filter({ id });
      reg = rows[0] || null;
    } else {
      // Offline: look up from cache
      const cached = cacheRead(tenantId, 'HazMatRegistry') || [];
      reg = cached.find(r => r.id === id) || null;
    }

    if (!reg) { setLoading(false); return; }
    setEntry(reg);

    const sha = reg.file_sha256;
    if (!sha) { setLoading(false); return; }

    if (online) {
      // Live fetch — all linked by file_sha256
      const [allProducts, haz, comp, secs] = await Promise.all([
        base44.entities.ProductMaster.filter({ file_sha256: sha }),
        base44.entities.Hazard.filter({ file_sha256: sha }),
        base44.entities.Composition.filter({ file_sha256: sha }),
        base44.entities.SDSSection.filter({ file_sha256: sha }),
      ]);
      console.log(`[ChemicalDetail] file_sha256=${sha}, raw comp count=${comp.length}`);
      // Prefer is_current: true, fall back to first available
      const product = allProducts.find(p => p.is_current === true) || allProducts[0] || null;
      console.log(`[ChemicalDetail] product loaded:`, product?.product_name, `pictogram_url=${product?.pictogram_url}`);
      setProduct(product);
      setHazards(haz); // No dedup—each hazard record is distinct (H280, P403 are different)
      // Deduplicate composition by chemical_name (keep first)
      const seen = new Set();
      const dedupComp = comp.filter(c => {
        if (seen.has(c.chemical_name)) {
          console.log(`[ChemicalDetail] Dedup filtered: ${c.chemical_name}`);
          return false;
        }
        seen.add(c.chemical_name);
        return true;
      });
      console.log(`[ChemicalDetail] after dedup count=${dedupComp.length}, unique names=${seen.size}`);
      setComposition(dedupComp);
      // Deduplicate sections by section_number (keep first)
      const seenSections = new Set();
      const dedupSections = secs.filter(s => {
        if (seenSections.has(s.section_number)) return false;
        seenSections.add(s.section_number);
        return true;
      }).sort((a, b) => (a.section_number || 0) - (b.section_number || 0));
      setSections(dedupSections);
    } else {
      // Offline: filter from local cache by file_sha256
      const cachedProducts = cacheRead(tenantId, 'ProductMaster') || [];
      const cachedHazards = cacheRead(tenantId, 'Hazard') || [];
      const cachedComp = cacheRead(tenantId, 'Composition') || [];
      const cachedSections = cacheRead(tenantId, 'SDSSection') || [];

      setProduct(cachedProducts.find(p => p.file_sha256 === sha && p.is_current !== false) || null);
      setHazards(cachedHazards.filter(h => h.file_sha256 === sha)); // No dedup—each hazard record is distinct
      // Deduplicate composition by chemical_name (keep first)
      const seen = new Set();
      const dedupComp = cachedComp
        .filter(c => c.file_sha256 === sha)
        .filter(c => {
          if (seen.has(c.chemical_name)) return false;
          seen.add(c.chemical_name);
          return true;
        });
      setComposition(dedupComp);
      // Deduplicate sections by section_number (keep first)
      const seenSections = new Set();
      const dedupSections = cachedSections
        .filter(s => s.file_sha256 === sha)
        .filter(s => {
          if (seenSections.has(s.section_number)) return false;
          seenSections.add(s.section_number);
          return true;
        })
        .sort((a, b) => (a.section_number || 0) - (b.section_number || 0));
      setSections(dedupSections);
    }

    setLoading(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  if (!entry) return (
    <div className="p-6 text-center text-muted-foreground">Entry not found.</div>
  );

  // Deduplicate by code + statements combination
  const dedupHazards = (stmts) => {
    const seen = new Set();
    return stmts.filter(h => {
      const key = `${h.code}|${h.statements}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const isFastTrack = !product && entry?.Risk_Rating_Desc?.toLowerCase().includes('fast');

  const hStatements = dedupHazards(hazards.filter(h => h.statement_type === 'H' || h.statement_type === 'H-Statement'));
   const pStatements = dedupHazards(hazards.filter(h => h.statement_type === 'P' || h.statement_type === 'P-Statement'));
   const pictogramUrls = [...new Set(hazards.map(h => h.pictogram_url).filter(url => url && url.trim().length > 0 && url.trim().toUpperCase() !== 'NULL'))];

   const riskLabel = entry.Risk_Rating_Desc || String(entry.Risk_Rating || '');

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/register">
          <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" /> Back</Button>
        </Link>
        {!online && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            <WifiOff size={11} /> Offline — cached data
          </span>
        )}
      </div>

      {/* Header */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start gap-4">
          {/* Same resolution order as HazMatRegisterMobile: ProductMaster → Fast Track → Hazard → Registry */}
          {(() => {
            const isFastTrack = !product && entry?.Risk_Rating_Desc?.toLowerCase().includes('fast');
            const hazardPic = entry.file_sha256 ? hazards.find(h => h.file_sha256 === entry.file_sha256)?.pictogram_url : null;
            const picUrl = product?.pictogram_url ||
              (isFastTrack ? 'https://upload.wikimedia.org/wikipedia/commons/d/da/GHS_FAST_Track.png' : null) ||
              hazardPic ||
              entry.pictogram_url;
            return picUrl ? (
              <CachedImg url={picUrl} alt="pictogram" className="w-12 h-12 rounded-xl object-contain" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <FlaskConical size={22} className="text-primary" />
              </div>
            );
          })()}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-bold font-space-grotesk">{entry.product_name}</h1>
              {entry.Top_25_List === 'Yes' && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-0.5">
                  <Star size={11} /> Top 25
                </span>
              )}
              {entry.status && entry.status !== 'Active' && <Badge variant="outline">{entry.status}</Badge>}
            </div>
            <p className="text-muted-foreground text-sm mt-1">{entry.supplier_name}</p>
            {entry.supplier_product && (
              <p className="text-muted-foreground text-xs mt-0.5 italic">{entry.supplier_product}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-3">
              {entry.Risk_Rating != null && (
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${getRiskColor(entry.Risk_Rating).bg} ${getRiskColor(entry.Risk_Rating).text}`}>
                  {entry.Risk_Rating}
                </div>
              )}
              {riskLabel && <RiskBadge rating={riskLabel} size="md" />}
              {product?.signal_word && (
                <span className="px-2.5 py-1 bg-orange-50 border border-orange-200 text-orange-800 rounded-lg text-sm font-semibold">
                  ⚠️ {product.signal_word}
                </span>
              )}
            </div>


          </div>
          {product && (product.NFPA_H != null || product.NFPA_F != null || product.NFPA_R != null) && (
            product.nfpa_pictogram_url
              ? <CachedImg url={product.nfpa_pictogram_url} alt="NFPA" className="w-20 h-20 object-contain" />
              : <NFPADiamond health={product.NFPA_H} flammability={product.NFPA_F} reactivity={product.NFPA_R} />
          )}
        </div>

        {/* SDS Link */}
        {product?.pdf_url && (
          <div className="mt-4 pt-4 border-t border-border">
            <button
              onClick={() => openSDS(product.pdf_url)}
              className="inline-flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              <Download size={14} /> Open SDS Document
            </button>
            {product.sds_date && (
              <p className="text-xs text-muted-foreground mt-2">
                SDS Date: <span className="font-medium">{new Date(product.sds_date).toLocaleDateString()}</span>
              </p>
            )}
          </div>
        )}

        {/* Recommended Uses */}
        {product?.recommended_uses && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground font-semibold mb-1">Recommended Uses</p>
            <p className="text-sm text-foreground">{product.recommended_uses}</p>
          </div>
        )}

        {/* Site + Location Info */}
        <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-3">
          {entry.Site && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin size={14} className="text-muted-foreground" />
              <span className="text-muted-foreground">Site:</span>
              <span className="font-medium">{entry.Site}</span>
            </div>
          )}
          {entry.Responsible_Department && (
            <div className="flex items-center gap-2 text-sm">
              <Building2 size={14} className="text-muted-foreground" />
              <span className="text-muted-foreground">Dept:</span>
              <span className="font-medium">{entry.Responsible_Department}</span>
            </div>
          )}
          {entry.ERP_Number && (
            <div className="text-sm">
              <span className="text-muted-foreground">ERP#:</span>
              <span className="font-medium ml-1">{entry.ERP_Number}</span>
            </div>
          )}
          {entry.Onsite_Contractor && (
            <div className="text-sm">
              <span className="text-muted-foreground">Contractor:</span>
              <span className="font-medium ml-1">{entry.Onsite_Contractor}</span>
            </div>
          )}
        </div>
      </div>

      {/* Emergency Contact */}
      {(entry.Fasttrack_Supplier_Contact || product?.emergency_phone) && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-center gap-3">
            <Phone size={20} className="text-red-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-900">Emergency / Supplier Contact</p>
              <p className="text-sm text-red-700">
                {entry.Fasttrack_Supplier_Contact}
                {product?.emergency_phone && ` · Emergency: ${product.emergency_phone}`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* GHS Pictograms from Hazards rows — only render section if valid URLs exist and not Fast Track */}
       {!isFastTrack && pictogramUrls.filter(url => url && url.trim()).length > 0 && (
         <Card>
           <CardHeader className="pb-2"><CardTitle className="text-sm">GHS Pictograms</CardTitle></CardHeader>
           <CardContent className="flex flex-wrap gap-3">
             {pictogramUrls.map(url => {
               const cachedSrc = getCachedImage(tenantId, url);
               console.log(`[ChemicalDetail] GHS Pictogram source=${cachedSrc ? 'cache' : 'direct'}, url=${url}`);
               return cachedSrc ? (
                 <img key={url} src={cachedSrc} alt="GHS pictogram" className="w-16 h-16 object-contain rounded border border-border p-1" />
               ) : url ? (
                 <img key={url} src={url} alt="GHS pictogram" className="w-16 h-16 object-contain rounded border border-border p-1" crossOrigin="anonymous" onError={() => console.warn(`[ChemicalDetail] GHS Pictogram failed to load: ${url}`)} />
               ) : (
                 <div key={url} className="w-16 h-16 rounded border border-border p-1 bg-muted/30 flex items-center justify-center text-xs text-muted-foreground">No img</div>
               );
             })}
           </CardContent>
         </Card>
       )}

       {/* Tabs — only show for non-Fast Track entries */}
       {!isFastTrack && (
         <Tabs defaultValue="hazards">
           <TabsList className="w-full justify-start overflow-x-auto">
             <TabsTrigger value="hazards">Hazard Statements</TabsTrigger>
             <TabsTrigger value="composition">Composition</TabsTrigger>
             <TabsTrigger value="sds">SDS Sections</TabsTrigger>
             <TabsTrigger value="details">Registry Details</TabsTrigger>
           </TabsList>

           <TabsContent value="hazards" className="space-y-3">
             {hStatements.length > 0 && (
               <Card>
                 <CardHeader className="pb-2">
                   <CardTitle className="text-sm flex items-center gap-2">
                     <AlertTriangle size={14} className="text-orange-500" /> H-Statements
                   </CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-2">
                   {hStatements.map((h, i) => (
                     <div key={i} className="flex gap-3 py-1.5 border-b border-border last:border-0">
                       <Badge variant="outline" className="font-mono text-xs shrink-0">{h.code}</Badge>
                       <span className="text-sm">{h.statements}</span>
                     </div>
                   ))}
                 </CardContent>
               </Card>
             )}
             {pStatements.length > 0 && (
               <Card>
                 <CardHeader className="pb-2"><CardTitle className="text-sm">P-Statements (Precautionary)</CardTitle></CardHeader>
                 <CardContent className="space-y-2">
                   {pStatements.map((h, i) => (
                     <div key={i} className="flex gap-3 py-1.5 border-b border-border last:border-0">
                       <Badge variant="outline" className="font-mono text-xs shrink-0">{h.code}</Badge>
                       <span className="text-sm">{h.statements}</span>
                     </div>
                   ))}
                 </CardContent>
               </Card>
             )}
             {hazards.length === 0 && (
               <div className="text-center py-8 text-muted-foreground text-sm">No hazard statements linked.</div>
             )}
           </TabsContent>

           <TabsContent value="composition">
             <Card>
               <CardContent className="p-0">
                 {composition.length === 0 ? (
                   <div className="text-center py-8 text-muted-foreground text-sm">No composition data linked.</div>
                 ) : (
                   <>
                     <div className="overflow-x-auto">
                       <table className="w-full text-sm">
                         <thead className="bg-muted/50">
                           <tr>
                             {['Ingredient', 'CAS No.', 'EC No.', 'Concentration', 'Hazard Classes'].map(h => (
                               <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                             ))}
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-border">
                           {composition.map((c, i) => (
                             <tr key={i} className="hover:bg-muted/30">
                               <td className="px-4 py-2.5 font-medium">
                                 <button
                                   onClick={() => setSelectedChemical(c)}
                                   className="text-primary hover:underline text-left"
                                 >
                                   {c.chemical_name}
                                 </button>
                               </td>
                               <td className="px-4 py-2.5 font-mono text-xs">{c.cas_number || '—'}</td>
                               <td className="px-4 py-2.5 font-mono text-xs">{c.ec_number || '—'}</td>
                               <td className="px-4 py-2.5">
                                 {c.conc_value != null
                                   ? `${c.conc_value}${c.conc_unit || '%'}`
                                   : c.conc_min != null
                                     ? `${c.conc_min}–${c.conc_max}${c.conc_unit || '%'}`
                                     : '—'}
                               </td>
                               <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.hazard_classes || '—'}</td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>

                     {/* PubChem viewer */}
                     {selectedChemical && (
                       <Card className="mt-4">
                         <CardHeader className="pb-2 flex flex-row items-center justify-between">
                           <CardTitle className="text-sm">{selectedChemical.chemical_name} - PubChem</CardTitle>
                           <button
                             onClick={() => setSelectedChemical(null)}
                             className="text-muted-foreground hover:text-foreground text-lg"
                           >
                             ✕
                           </button>
                         </CardHeader>
                         <CardContent>
                           <iframe
                             src={`https://pubchem.ncbi.nlm.nih.gov/compound/${encodeURIComponent(selectedChemical.chemical_name)}`}
                             className="w-full h-96 border border-border rounded"
                             title={`PubChem: ${selectedChemical.chemical_name}`}
                           />
                         </CardContent>
                       </Card>
                     )}
                   </>
                 )}
               </CardContent>
             </Card>
           </TabsContent>

           <TabsContent value="sds" className="space-y-3">
             {sections.length === 0 ? (
               <div className="text-center py-8 text-muted-foreground text-sm">No SDS sections available.</div>
             ) : (
               <>
                 {/* Section filter */}
                 <div className="mb-4">
                   <select
                     value={selectedSection}
                     onChange={(e) => setSelectedSection(e.target.value)}
                     className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                   >
                     <option value="all">View all sections</option>
                     {sections.map(sec => (
                       <option key={sec.section_number} value={sec.section_number}>
                         {SDS_SECTION_HEADINGS[sec.section_number] || `Section ${sec.section_number}`}
                       </option>
                     ))}
                   </select>
                 </div>
                 {/* Sections */}
                 {sections
                   .filter(sec => selectedSection === 'all' || parseInt(selectedSection) === sec.section_number)
                   .map(sec => (
                     <Card key={sec.id || sec.section_number}>
                       <CardHeader className="pb-1">
                         <CardTitle className="text-sm">{SDS_SECTION_HEADINGS[sec.section_number] || `Section ${sec.section_number}`}</CardTitle>
                       </CardHeader>
                       <CardContent>
                         <p className="text-sm whitespace-pre-wrap text-muted-foreground">{sec.text}</p>
                       </CardContent>
                     </Card>
                   ))}
               </>
             )}
           </TabsContent>

           <TabsContent value="details">
             <Card>
               <CardContent className="pt-4">
                 <InfoRow label="file_sha256" value={entry.file_sha256} />
                 <InfoRow label="Site_Chem_Id" value={entry.Site_Chem_Id} />
                 <InfoRow label="ERP Number" value={entry.ERP_Number} />
                 <InfoRow label="Contractor" value={entry.Onsite_Contractor} />
                 <InfoRow label="Vehicle Reg." value={entry.Fasttrack_Vech_Reg} />
                 <InfoRow label="Supplier Contact" value={entry.Fasttrack_Supplier_Contact} />
                 <InfoRow label="Risk Rating" value={entry.Risk_Rating != null ? `${entry.Risk_Rating} — ${entry.Risk_Rating_Desc || ''}` : null} />
                 <InfoRow label="Likelihood" value={entry.Likelihood != null ? String(entry.Likelihood) : null} />
                 <InfoRow label="RA Doc Date" value={entry.Ra_Doc_Date} />
                 <InfoRow label="Notes" value={entry.notes} />
                 {entry.Fasttrack_SDS && (
                   <div className="flex gap-3 py-2 border-b border-border">
                     <span className="text-sm text-muted-foreground w-44 shrink-0">SDS PDF</span>
                     <a href={entry.Fasttrack_SDS} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                       <FileText size={13} /> View SDS
                     </a>
                   </div>
                 )}
                 {entry.Site_RA_Doc && (
                   <div className="flex gap-3 py-2 border-b border-border">
                     <span className="text-sm text-muted-foreground w-44 shrink-0">Risk Assessment</span>
                     <a href={entry.Site_RA_Doc} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                       <FileText size={13} /> View RA
                     </a>
                   </div>
                 )}
               </CardContent>
             </Card>
           </TabsContent>
         </Tabs>
       )}

      {/* Site images — always show for Fast Track entries */}
       {(entry.Fasttrack_Img1 || entry.Fasttrack_Img2 || entry.Fasttrack_Vech_Reg) && (
         <Card>
           <CardHeader className="pb-2"><CardTitle className="text-sm">Site & Vehicle Images</CardTitle></CardHeader>
           <CardContent className="flex gap-3 flex-wrap">
             {entry.Fasttrack_Img1 && (
               <CachedImg url={entry.Fasttrack_Img1} alt="Site image 1" className="h-40 rounded-lg object-cover border border-border" />
             )}
             {entry.Fasttrack_Img2 && (
               <CachedImg url={entry.Fasttrack_Img2} alt="Site image 2" className="h-40 rounded-lg object-cover border border-border" />
             )}
             {entry.Fasttrack_Vech_Reg && (
               <CachedImg url={entry.Fasttrack_Vech_Reg} alt="Vehicle registration" className="h-40 rounded-lg object-cover border border-border" />
             )}
           </CardContent>
         </Card>
       )}
    </div>
  );
}