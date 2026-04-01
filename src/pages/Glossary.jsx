import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronRight } from 'lucide-react';

export default function Glossary() {
  const [ghsCodes, setGhsCodes] = useState([]);
  const [ghsPictograms, setGhsPictograms] = useState([]);
  const [nfpaGuide, setNfpaGuide] = useState([]);
  const [ppeItems, setPpeItems] = useState([]);
  const [precautionary, setPrecautionary] = useState([]);
  const [glossaryTerms, setGlossaryTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ghsSearch, setGhsSearch] = useState('');
  const [precautionarySearch, setPrecautionarySearch] = useState('');
  const [termsSearch, setTermsSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [expandedTermId, setExpandedTermId] = useState(null);

  useEffect(() => {
    Promise.all([
      base44.entities.GHSHazardCode.list('code', 500),
      base44.entities.GHSPictogram.list('description', 200),
      base44.entities.NFPAGuide.list('class', 200),
      base44.entities.PPEReference.list('ppe_name', 200),
      base44.entities.GHSPrecautionaryStatement.list('code', 500),
      base44.entities.GlossaryTerm.list('term', 500),
    ]).then(([codes, pictograms, nfpa, ppe, prec, terms]) => {
      // Extract array from response objects
      const codesArr = Array.isArray(codes) ? codes : (codes?.data || []);
      const pictogramsArr = Array.isArray(pictograms) ? pictograms : (pictograms?.data || []);
      const nfpaArr = Array.isArray(nfpa) ? nfpa : (nfpa?.data || []);
      const ppeArr = Array.isArray(ppe) ? ppe : (ppe?.data || []);
      const precArr = Array.isArray(prec) ? prec : (prec?.data || []);
      const termsArr = Array.isArray(terms) ? terms : (terms?.data || []);

      setGhsCodes(codesArr.filter(r => r.is_deleted !== 1 && r.is_deleted !== true));
      // Deduplicate pictograms by description
      const seen = new Set();
      const dedupPictograms = pictogramsArr.filter(p => {
        if (p.is_deleted === 1 || p.is_deleted === true || seen.has(p.description)) return false;
        seen.add(p.description);
        return true;
      });
      setGhsPictograms(dedupPictograms);
      
      // Deduplicate NFPA by class+level+rule
      const nfpaSeen = new Set();
      const dedupNfpa = nfpaArr.filter(item => {
        if (item.is_deleted === 1 || item.is_deleted === true) return false;
        const key = `${item.class}|${item.level}|${item.rule}`;
        if (nfpaSeen.has(key)) return false;
        nfpaSeen.add(key);
        return true;
      });
      setNfpaGuide(dedupNfpa);
      
      // Deduplicate glossary terms by category+term
      const termsSeen = new Set();
      const dedupTerms = termsArr.filter(t => {
        if (t.is_deleted === 1 || t.is_deleted === true) return false;
        const key = `${t.category}|${t.term}`;
        if (termsSeen.has(key)) return false;
        termsSeen.add(key);
        return true;
      });
      setGlossaryTerms(dedupTerms);
      
      setPpeItems(ppeArr.filter(r => r.is_deleted !== 1 && r.is_deleted !== true));
      setPrecautionary(precArr.filter(r => r.is_deleted !== 1 && r.is_deleted !== true));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const parseGHSCode = (c) => {
    const match = (c.statement || '').match(/^([A-Z]+\d+[A-Z]?)\s*:/);
    return match ? match[1] : (c.code || '');
  };

  const filteredGHS = Array.from(
    ghsCodes.reduce((map, c) => {
      const key = (c.statement || '').trim();
      if (!key) return map;
      const existing = map.get(key);
      if (!existing || new Date(c.created_date) > new Date(existing.created_date)) {
        map.set(key, c);
      }
      return map;
    }, new Map()).values()
  )
    .filter(c =>
      (c.code || '').toLowerCase().includes(ghsSearch.toLowerCase()) ||
      (c.statement || '').toLowerCase().includes(ghsSearch.toLowerCase())
    )
    .sort((a, b) => parseGHSCode(a).localeCompare(parseGHSCode(b), undefined, { numeric: true, sensitivity: 'base' }));

  const nfpaByClass = nfpaGuide.reduce((acc, item) => {
    const key = item.class || 'General';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const uniqueCategories = [...new Set(glossaryTerms.map(t => t.category))].filter(Boolean).sort();
  const filteredTerms = glossaryTerms
    .filter(t =>
      (categoryFilter === 'all' || t.category === categoryFilter) &&
      (t.term || '').toLowerCase().includes(termsSearch.toLowerCase())
    )
    .sort((a, b) => (a.term || '').localeCompare(b.term || ''));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div>
         <h1 className="text-2xl font-bold font-space-grotesk" style={{ color: '#145370' }}>Glossary</h1>
         <p className="text-muted-foreground text-sm">Reference library for SDS terms, hazard terminology, pictograms, NFPA guidance, PPE references, and other safety lookup content</p>
       </div>

      <Tabs defaultValue="terms">
        <TabsList className="overflow-x-auto w-full justify-start">
          <TabsTrigger value="terms">Terms ({glossaryTerms.length})</TabsTrigger>
          <TabsTrigger value="ghs">GHS Codes ({ghsCodes.length})</TabsTrigger>
          <TabsTrigger value="precautionary">Precautionary Statements ({precautionary.length})</TabsTrigger>
          <TabsTrigger value="pictograms">Pictograms ({ghsPictograms.length})</TabsTrigger>
          <TabsTrigger value="nfpa">NFPA Guide ({nfpaGuide.length})</TabsTrigger>
          <TabsTrigger value="ppe">PPE Reference ({ppeItems.length})</TabsTrigger>
        </TabsList>

        {/* Terms Tab */}
        <TabsContent value="terms" className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <input
              type="text"
              placeholder="Search terms..."
              value={termsSearch}
              onChange={e => setTermsSearch(e.target.value)}
              className="flex-1 min-w-32 px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {uniqueCategories.length > 0 && (
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All Categories</option>
                {uniqueCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            )}
          </div>
          {filteredTerms.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">No terms found. Run a sync to populate.</p>
          ) : (
            <div className="space-y-1">
              {filteredTerms.map(term => (
                <div
                  key={term.id}
                  onClick={() => setExpandedTermId(expandedTermId === term.id ? null : term.id)}
                  className="p-3 bg-card border border-border rounded-lg cursor-pointer hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className="font-semibold text-sm">{term.term}</p>
                        {term.abbreviation && <Badge variant="outline" className="text-xs">{term.abbreviation}</Badge>}
                      </div>
                      {expandedTermId === term.id && (
                        <div className="mt-2 space-y-2 pt-2 border-t border-border">
                          {term.definition && (
                            <div>
                              <p className="text-xs text-muted-foreground">Definition</p>
                              <p className="text-sm">{term.definition}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <ChevronRight
                      size={16}
                      className={`text-muted-foreground transition-transform ${expandedTermId === term.id ? 'rotate-90' : ''}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* GHS Hazard Codes */}
        <TabsContent value="ghs" className="space-y-3">
          <input
            type="text"
            placeholder="Search GHS codes or statements..."
            value={ghsSearch}
            onChange={e => setGhsSearch(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {filteredGHS.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">No GHS codes found. Run a sync to populate.</p>
          ) : (
            <div className="space-y-1">
              {filteredGHS.map(c => {
                const parsedCode = parseGHSCode(c);
                const description = (c.statement || '').replace(/^[A-Z]+\d+[A-Z]?\s*:\s*/, '');
                return (
                  <div key={c.id} className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg">
                    {c.pictogram_img && <img src={c.pictogram_img} alt={parsedCode} className="w-8 h-8 object-contain shrink-0" />}
                    <Badge variant="outline" className="font-mono text-xs shrink-0 mt-0.5">{parsedCode}</Badge>
                    <span className="text-sm flex-1">{description}</span>
                    {c.type && (
                      <Badge variant="secondary" className="text-xs shrink-0">{c.type.split('-')[0]}</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Precautionary Statements */}
        <TabsContent value="precautionary" className="space-y-3">
          <input
            type="text"
            placeholder="Search precautionary codes or statements..."
            value={precautionarySearch}
            onChange={e => setPrecautionarySearch(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {(() => {
            const filtered = precautionary
              .filter(c =>
                (c.code || '').toLowerCase().includes(precautionarySearch.toLowerCase()) ||
                (c.description || '').toLowerCase().includes(precautionarySearch.toLowerCase())
              )
              .sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' }));
            return filtered.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">No precautionary statements found. Run a sync to populate.</p>
            ) : (
              <div className="space-y-1">
                {filtered.map(c => (
                  <div key={c.id} className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg">
                    <Badge variant="outline" className="font-mono text-xs shrink-0 mt-0.5">{c.code}</Badge>
                    <span className="text-sm flex-1">{c.description}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </TabsContent>

        {/* GHS Pictograms */}
        <TabsContent value="pictograms">
          {ghsPictograms.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">No pictograms found. Run a sync to populate.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ghsPictograms.map(p => (
                <Card key={p.id}>
                  <CardContent className="p-4 flex gap-4 items-start">
                    <div className="w-14 h-14 rounded border-2 border-border flex items-center justify-center bg-white shrink-0">
                      {p.pictogram_img
                        ? <img src={p.pictogram_img} alt={p.description} className="w-12 h-12 object-contain" />
                        : <span className="text-2xl">⚠️</span>
                      }
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{p.description}</p>
                      {p.hint_text && <p className="text-xs text-muted-foreground mt-1">{p.hint_text}</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* NFPA Guide */}
        <TabsContent value="nfpa" className="space-y-4">
          {Object.keys(nfpaByClass).length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">No NFPA data found. Run a sync to populate.</p>
          ) : (
            Object.entries(nfpaByClass).map(([cls, items]) => (
              <Card key={cls}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm" style={{ color: '#145370' }}>{cls}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {items.sort((a, b) => Number(a.level) - Number(b.level)).map((item) => (
                    <div key={item.id} className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{item.level}</span>
                      <span className="text-sm">{item.rule}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* PPE Reference */}
        <TabsContent value="ppe" className="space-y-4">
          {ppeItems.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">No PPE data found. Run a sync to populate.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ppeItems.map(item => (
                <Card key={item.id}>
                  <CardContent className="p-4 flex flex-col gap-3 items-center">
                    <div className="w-16 h-16 rounded border-2 border-border flex items-center justify-center bg-white">
                      {item.image_url
                        ? <img src={item.image_url} alt={item.ppe_name} className="w-14 h-14 object-contain" />
                        : <span className="text-2xl">🛡️</span>
                      }
                    </div>
                    <p className="text-sm font-medium text-center">{item.ppe_name}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}