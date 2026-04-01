/**
 * useOfflineData — channel-aware data access hook.
 *
 * Mobile (iOS/Android):  reads from IndexedDB (populated at startup sync).
 *                        Falls back to live API if IndexedDB is empty.
 * Browser:               reads live from Base44 API. Falls back to in-memory
 *                        cached value on network drop (no persistent storage).
 */

import { useState, useEffect } from 'react';
import { isMobilePlatform } from '@/lib/platformDetect';
import { dbGetAll } from '@/lib/mobileDb';
import { useTenant } from '@/lib/TenantContext';

export function useIsOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/**
 * Hook that resolves data from the right channel.
 * @param {string} tenantId
 * @param {string} table   - IndexedDB store name (e.g. 'registry', 'products')
 * @param {Function} liveFetcher - async fn that fetches from Base44 API
 * @param {Array} deps     - extra deps that trigger re-fetch
 */
export function useOfflineData(tenantId, table, liveFetcher, deps = []) {
  const online = useIsOnline();
  const isMobile = isMobilePlatform();
  const { syncStatus } = useTenant();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cachedData, setCachedData] = useState(null);

  useEffect(() => {
    if (!tenantId) { setLoading(false); return; }

    if (isMobile) {
      // Mobile: read from IndexedDB (synced at startup)
      dbGetAll(table)
        .then(rows => {
          if (rows && rows.length > 0) {
            setData(rows);
            setCachedData(rows);
            setLoading(false);
          } else if (online) {
            // IndexedDB empty — fall back to live API (first-run edge case)
            setLoading(true);
            liveFetcher()
              .then(r => { 
                setData(r); 
                setCachedData(r);
                setLoading(false); 
              })
              .catch(() => { 
                setData(cachedData || []); 
                setLoading(false); 
              });
          } else {
            setData(cachedData || []);
            setLoading(false);
          }
        })
        .catch(() => { 
          setData(cachedData || []); 
          setLoading(false); 
        });
    } else {
      // Browser: stale-while-revalidate pattern
      // Show cached data immediately, then fetch fresh
      if (cachedData) {
        setData(cachedData);
        setLoading(false);
      } else {
        setLoading(true);
      }

      if (!online) { 
        setData(cachedData || []);
        setLoading(false);
        return; 
      }

      liveFetcher()
        .then(rows => { 
          setData(rows); 
          setCachedData(rows);
          setLoading(false); 
        })
        .catch(() => { 
          setData(cachedData || []); 
          setLoading(false); 
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, online, isMobile, syncStatus, ...deps]);

  return { data, loading, online };
}