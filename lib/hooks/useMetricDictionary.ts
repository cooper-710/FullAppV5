import { useEffect, useState } from 'react';
import { STAT_DICTIONARY } from '@/data/stat-dictionary';
import type { MetricDef } from '@/lib/types';
import { fetchMetricDictionary } from '@/lib/api/fullApp';

let cached: MetricDef[] | null = STAT_DICTIONARY;
let pending: Promise<MetricDef[]> | null = null;

export function useMetricDictionary() {
  const [data, setData] = useState<MetricDef[] | null>(cached);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    if (cached) {
      setData(cached);
    }

    if (!pending) {
      pending = fetchMetricDictionary().finally(() => {
        pending = null;
      });
    }

    pending
      .then((rows) => {
        if (!active) return;
        cached = rows;
        setData(rows);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err : new Error('Failed to load metrics'));
      });

    return () => {
      active = false;
    };
  }, []);

  return { data, error };
}
