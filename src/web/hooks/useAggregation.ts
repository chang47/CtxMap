import { useState, useEffect, useCallback } from 'react';
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

  const fetchData = useCallback(async () => {
    try {
      // Add cache-busting query param for live mode
      const url = live ? `/data.json?t=${Date.now()}` : '/data.json';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
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
  }, [live]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Polling for live mode
  useEffect(() => {
    if (!live) return;

    const pollInterval = setInterval(fetchData, interval);
    return () => clearInterval(pollInterval);
  }, [live, interval, fetchData]);

  return { data, loading, error, lastUpdated, refresh: fetchData };
}
