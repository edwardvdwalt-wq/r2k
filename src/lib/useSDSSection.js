import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export function useSDSSection(file_sha256, tenant_id) {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!file_sha256 || !tenant_id) return;

    const fetchSections = async () => {
      setLoading(true);
      setError(null);
      try {
        // Try to fetch from backend (merges core + on-demand)
        const result = await base44.functions.invoke('fetchSDSOnDemand', {
          file_sha256,
          tenant_id,
        });
        
        if (result.data?.data) {
          setSections(result.data.data);
        }
      } catch (err) {
        console.error('Failed to fetch SDS sections:', err);
        setError(err.message || 'Failed to load SDS data');
      } finally {
        setLoading(false);
      }
    };

    fetchSections();
  }, [file_sha256, tenant_id]);

  return { sections, loading, error };
}