import { useState, useEffect, useCallback, useRef } from 'react';
import type { MassAggregation } from '../../core/types';

interface UseAggregationOptions {
  /** Enable live polling for updates */
  live?: boolean;
  /** Polling interval in milliseconds (default: 5000) */
  interval?: number;
}

export function useAggregation(options: UseAggregationOptions = {}) {
  const { live = false, interval = 5000 } = options;

  const [data, setData] = useState<MassAggregation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Track last seen Last-Modified to avoid unnecessary updates
  const lastModifiedRef = useRef<string | null>(null);

  const fetchData = useCallback(async (force = false) => {
    try {
      const response = await fetch('/data.json');

      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
      }

      // Check Last-Modified header to avoid re-rendering if unchanged
      const lastModified = response.headers.get('Last-Modified');
      if (!force && lastModified && lastModified === lastModifiedRef.current) {
        // Data unchanged, skip update
        return;
      }

      // Store the Last-Modified value for next comparison
      if (lastModified) {
        lastModifiedRef.current = lastModified;
      }

      const json = await response.json();
      setData(json);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData(true); // Force initial fetch
  }, [fetchData]);

  // Polling for live mode
  useEffect(() => {
    if (!live) return;

    const pollInterval = setInterval(() => fetchData(false), interval);
    return () => clearInterval(pollInterval);
  }, [live, interval, fetchData]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    refresh: () => fetchData(true), // Manual refresh always forces update
  };
}
