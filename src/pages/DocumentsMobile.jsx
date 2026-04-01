import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Download, Archive, FileText, Image, AlertCircle, Star } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import TenantGate from '@/components/shared/TenantGate';
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileSection from '@/components/mobile/MobileSection';
import MobileBottomNav from '@/components/mobile/MobileBottomNav';
import MobileSearchInput from '@/components/mobile/MobileSearchInput';
import { useOfflineData } from '@/lib/useOfflineData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

function DocumentsMobileInner() {
  const [search, setSearch] = useState('');
  const { tenantId } = useTenant();

  const { data: documents, loading } = useOfflineData(
    tenantId, 'Document',
    () => base44.entities.Document.filter({ tenant_id: tenantId, is_active: true }, '-created_date', 1000)
  );

  // Group documents by type
  const groupedDocs = documents.reduce((acc, doc) => {
    if (!acc[doc.document_type]) acc[doc.document_type] = [];
    acc[doc.document_type].push(doc);
    return acc;
  }, {});

  // Order: SDS, RA, Images, ERP, Policy, Other
  const typeOrder = ['SDS PDF', 'RA Doc', 'Image', 'ERP', 'SHEQ Policy', 'Other'];
  const orderedTypes = typeOrder.filter(t => groupedDocs[t]);

  // Filter by search
  const filtered = {};
  const q = search.toLowerCase();
  orderedTypes.forEach(type => {
    filtered[type] = groupedDocs[type].filter(doc =>
      doc.title?.toLowerCase().includes(q) ||
      doc.filename?.toLowerCase().includes(q) ||
      doc.site_name?.toLowerCase().includes(q)
    );
  });

  const getIcon = (type) => {
    switch (type) {
      case 'SDS PDF':
        return <FileText size={18} className="text-blue-600" />;
      case 'Image':
        return <Image size={18} className="text-green-600" />;
      case 'RA Doc':
        return <AlertCircle size={18} className="text-orange-600" />;
      case 'ERP':
        return <Archive size={18} className="text-purple-600" />;
      case 'SHEQ Policy':
        return <FileText size={18} className="text-red-600" />;
      default:
        return <FileText size={18} className="text-gray-600" />;
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'SDS PDF':
        return 'bg-blue-50 border-blue-200';
      case 'Image':
        return 'bg-green-50 border-green-200';
      case 'RA Doc':
        return 'bg-orange-50 border-orange-200';
      case 'ERP':
        return 'bg-purple-50 border-purple-200';
      case 'SHEQ Policy':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '?';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const totalDocs = Object.values(filtered).flat().length;

  return (
    <div className="bg-background min-h-screen pb-20 md:pb-0">
      <MobileHeader title="Documents" showBack={false} />

      <div className="p-3 md:p-6 space-y-4">
        {/* Search */}
        <MobileSearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch('')}
          placeholder="Search documents..."
        />

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {/* Results */}
        {!loading && (
          <>
            <p className="text-xs text-muted-foreground">
              {totalDocs} {totalDocs === 1 ? 'document' : 'documents'}
            </p>

            {totalDocs === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText size={40} className="mx-auto opacity-30 mb-3" />
                <p className="text-sm">No documents found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {orderedTypes.map(type => {
                  const docs = filtered[type];
                  if (docs.length === 0) return null;

                  return (
                    <MobileSection
                      key={type}
                      title={`${type} (${docs.length})`}
                      defaultOpen={type === 'SDS PDF'}
                    >
                      <div className="space-y-2">
                        {docs.map(doc => (
                          <div
                            key={doc.id}
                            className={`border rounded-lg p-3 space-y-2 ${getTypeColor(type)}`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5">{getIcon(type)}</div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate">{doc.title}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {doc.site_name && `${doc.site_name} · `}
                                  {formatFileSize(doc.file_size)}
                                </p>
                              </div>
                              {doc.is_offline_priority && (
                                <Star size={14} className="text-amber-500 flex-shrink-0 mt-1" />
                              )}
                            </div>

                            <div className="flex gap-2">
                              {doc.file_url && (
                                <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="flex-1">
                                  <Button size="sm" variant="outline" className="w-full h-8 gap-1.5 text-xs">
                                    <Download size={12} /> Open
                                  </Button>
                                </a>
                              )}
                              {doc.is_offline_priority && (
                                <Badge variant="secondary" className="text-xs flex-shrink-0">
                                  Cached
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </MobileSection>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <MobileBottomNav />
    </div>
  );
}

export default function Documents() {
  return <TenantGate><DocumentsMobileInner /></TenantGate>;
}