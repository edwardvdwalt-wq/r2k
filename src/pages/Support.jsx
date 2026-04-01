import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Phone, BookOpen, Shield, AlertTriangle, HelpCircle, RefreshCw, CheckCircle2, WifiOff } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useTenant } from '@/lib/TenantContext';
import { useIsOnline } from '@/lib/useOfflineData';
import { cacheMeta } from '@/lib/offlineCache';

const FAQ = [
  { q: 'How do I search for a chemical?', a: 'Navigate to the Search page using the sidebar. You can search by product name, supplier, CAS number, site, department, or ERP number. Results are shown across the register, products, and sites.' },
  { q: 'What does the Top 25 List mean?', a: 'The Top 25 List flags the highest-priority hazardous substances at a site. These are substances that require special attention due to their frequency of use, quantity stored, or risk rating.' },
  { q: 'What do the NFPA numbers mean?', a: 'NFPA 704 uses a diamond divided into four coloured sections: Blue (Health), Red (Flammability), Yellow (Reactivity), and White (Special). Each section is rated 0–4, with 4 being the highest hazard.' },
  { q: 'What are GHS Pictograms?', a: 'GHS (Globally Harmonized System) pictograms are standardised hazard symbols used on chemical labels and SDS documents. They communicate specific hazard types such as flammability, toxicity, or environmental hazard.' },
  { q: 'Can I use this app offline?', a: 'Yes. Previously viewed records and any documents marked as Offline Priority are accessible without an internet connection. The app shows the last sync date in the dashboard.' },
  { q: 'What is the SDS viewer?', a: 'The SDS Viewer shows section-by-section content extracted from the Safety Data Sheet for a product. You can navigate through all 16 GHS SDS sections and view the full composition and hazard details.' },
  { q: 'Who can add or edit registry entries?', a: 'Only users with Admin or Site Coordinator roles can create, edit, or archive registry entries. Regular employees have read-only access to view and search chemical records.' },
];

const GHS_AWARENESS = [
  { title: 'Signal Words', content: 'GHS uses two signal words on labels: "Danger" (for more severe hazards) and "Warning" (for less severe hazards). Only one signal word appears on a label.' },
  { title: 'H-Statements (Hazard)', content: 'H-Statements describe the nature of the hazard. They are coded H2xx (physical), H3xx (health), or H4xx (environmental). Always read these statements carefully before handling a chemical.' },
  { title: 'P-Statements (Precautionary)', content: 'P-Statements describe recommended measures to minimise or prevent adverse effects. They cover prevention, response, storage, and disposal. Always follow P-Statement instructions.' },
  { title: 'SDS Sections', content: 'Every SDS has 16 standardised sections covering identification, hazards, composition, first aid, firefighting, accidental release, handling and storage, exposure controls, physical properties, stability, toxicology, ecology, disposal, transport, regulatory, and other information.' },
];

function ForceSyncCard() {
  const { tenantId, syncStatus, syncMessage, triggerSync } = useTenant();
  const online = useIsOnline();
  const meta = tenantId ? cacheMeta(tenantId) : null;
  const [done, setDone] = useState(false);
  const isSyncing = syncStatus === 'syncing';

  const handleSync = async () => {
    setDone(false);
    await triggerSync();
    setDone(true);
    setTimeout(() => setDone(false), 4000);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <RefreshCw size={16} /> Data Sync
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Force a full re-sync of your tenant's HazMat data to ensure you have the latest records available offline.</p>
          {meta?.lastSync && (
            <p className="text-xs">Last synced: <span className="font-medium text-foreground">{new Date(meta.lastSync).toLocaleString()}</span></p>
          )}
          {meta?.registryCount != null && (
            <p className="text-xs">Registry entries cached: <span className="font-medium text-foreground">{meta.registryCount}</span></p>
          )}
        </div>

        {!online && (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            <WifiOff size={13} /> You're offline — sync requires an internet connection.
          </div>
        )}

        {isSyncing && (
          <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-2.5">
            <RefreshCw size={13} className="animate-spin" /> {syncMessage || 'Syncing…'}
          </div>
        )}

        {done && !isSyncing && (
          <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-2.5">
            <CheckCircle2 size={13} /> Sync complete — data is up to date.
          </div>
        )}

        <Button
          className="w-full gap-2"
          onClick={handleSync}
          disabled={isSyncing || !online}
        >
          <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
          {isSyncing ? 'Syncing…' : 'Force Sync Now'}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Support() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold font-space-grotesk">Support & Training</h1>
        <p className="text-muted-foreground text-sm">Help resources, GHS awareness, and contact information</p>
      </div>

      <ForceSyncCard />

      {/* Emergency Banner */}
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle size={20} className="text-red-600 shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-900">Emergency</p>
            <p className="text-sm text-red-700">In a chemical emergency, call your local emergency services immediately. Refer to the product SDS for first aid and emergency procedures.</p>
          </div>
        </CardContent>
      </Card>

      {/* Quick Help Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Phone size={24} className="mx-auto mb-2 text-primary" />
            <p className="font-semibold text-sm">Emergency Contacts</p>
            <p className="text-xs text-muted-foreground mt-1">View site emergency contacts in each chemical detail page</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <BookOpen size={24} className="mx-auto mb-2 text-primary" />
            <p className="font-semibold text-sm">Document Library</p>
            <p className="text-xs text-muted-foreground mt-1">Access ERP, SHEQ Policy, and HazMat Manuals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Shield size={24} className="mx-auto mb-2 text-primary" />
            <p className="font-semibold text-sm">Lookup Library</p>
            <p className="text-xs text-muted-foreground mt-1">GHS codes, NFPA guide, PPE reference</p>
          </CardContent>
        </Card>
      </div>

      {/* FAQ */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><HelpCircle size={16} /> Frequently Asked Questions</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Accordion type="single" collapsible className="w-full">
            {FAQ.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-sm text-left">{f.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* GHS Awareness */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield size={16} /> GHS Awareness</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {GHS_AWARENESS.map((item, i) => (
            <div key={i} className="border-b border-border last:border-0 pb-4 last:pb-0">
              <p className="text-sm font-semibold mb-1">{item.title}</p>
              <p className="text-sm text-muted-foreground">{item.content}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardContent className="p-4 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">HazMat R2K</p>
          <p>Hazardous Materials Right-to-Know Register System</p>
          <p className="mt-2 text-xs">For technical support, contact your site coordinator or system administrator.</p>
        </CardContent>
      </Card>
    </div>
  );
}