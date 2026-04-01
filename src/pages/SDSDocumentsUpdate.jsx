import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { FlaskConical, ChevronRight } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import TenantGate from '@/components/shared/TenantGate';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import RiskBadge from '@/components/shared/RiskBadge';

function SDSDocumentsUpdateInner() {
  const { tenantId, activeSite } = useTenant();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    Promise.all([
      base44.entities.HazMatRegistry.filter({ tenant_id: tenantId }, '-created_date', 2000),
      base44.entities.ProductMaster.filter({ tenant_id: tenantId }, '-created_date', 2000)
    ]).then(([registry, products]) => {
      // Deduplicate by Site_Chem_Id to avoid inflated counts from repeated syncs
      const uniqueById = registry.reduce((acc, r) => {
        const key = r.Site_Chem_Id || r.id;
        if (!acc.has(key)) acc.set(key, r);
        return acc;
      }, new Map());
      const unique = [...uniqueById.values()];

      // Create map of file_sha256 -> ProductMaster
      const productMap = {};
      products.forEach(p => {
        productMap[p.file_sha256] = p;
      });

      // Filter entries where SDS is older than 5 years
      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

      const outdated = unique.filter(entry => {
        const product = productMap[entry.file_sha256];
        if (!product || !product.sds_date) return false;
        const sdsDate = new Date(product.sds_date);
        return sdsDate < fiveYearsAgo;
      }).map(entry => ({
        ...entry,
        sdsDate: productMap[entry.file_sha256]?.sds_date
      })).sort((a, b) => {
        return new Date(a.sdsDate) - new Date(b.sdsDate);
      });

      setEntries(outdated);
      setLoading(false);
    });
  }, [tenantId]);

  if (loading) return (
    <div className="flex items-center justify-center h-full p-12">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold font-space-grotesk" style={{ color: '#145370' }}>SDS Documents Requiring Update</h1>
        <p className="text-sm mt-0.5" style={{ color: '#145370' }}>Documents with SDS older than 5 years</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base" style={{ color: '#145370' }}>Documents Found</CardTitle>
            <span className="text-2xl font-bold font-space-grotesk" style={{ color: '#145370' }}>{entries.length}</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">All SDS documents are current.</div>
          ) : (
            <div className="space-y-2 p-4">
              {entries.map(entry => (
                <Link key={entry.id} to={`/register/${entry.id}`}>
                  <div className="bg-card border border-border rounded-xl px-4 py-3 hover:border-primary/40 hover:shadow-sm transition-all flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shrink-0 bg-white/30">
                      {entry.pictogram_url ? (
                        <img src={entry.pictogram_url} alt="hazard" className="w-8 h-8 object-contain" />
                      ) : (
                        <FlaskConical size={16} className="text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{entry.product_name}</p>
                      <p className="text-xs text-muted-foreground">{entry.Site} · {entry.supplier_name}</p>
                      <p className="text-xs text-muted-foreground">SDS Date: {entry.sdsDate ? new Date(entry.sdsDate).toLocaleDateString() : 'N/A'}</p>
                    </div>
                    <RiskBadge rating={entry.Risk_Rating_Desc} />
                    <ChevronRight size={14} className="text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SDSDocumentsUpdate() {
  return <TenantGate><SDSDocumentsUpdateInner /></TenantGate>;
}