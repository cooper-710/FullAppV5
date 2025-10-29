'use client';

import { Info } from 'lucide-react';
import { useMetricDictionary } from '@/lib/hooks/useMetricDictionary';
import { SourceBadge } from '@/components/Badges';

export function MetricInfo({ keyName }: { keyName: string }) {
  const { data } = useMetricDictionary();
  const m = data?.find((x) => x.key === keyName);
  if (!m) return null;

  return (
    <span className="group relative inline-flex items-center align-middle">
      <Info className="h-4 w-4 text-muted ml-1" />
      <div className="pointer-events-none absolute left-1/2 top-full z-50 hidden -translate-x-1/2 pt-2 group-hover:block">
        <div className="w-72 rounded-lg border border-border bg-surface p-3 shadow-lg">
          <div className="text-sm font-medium">
            {m.label}
            {m.unit ? ` (${m.unit})` : ''} <span className="text-muted">· {m.key}</span>
          </div>
          <p className="mt-1 text-[12px] leading-5 text-muted">{m.description}</p>
          <div className="mt-2 text-[12px] text-muted">
            Entity: <span className="text-text">{m.entity}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {m.sourcePreference.map((s) => (
              <SourceBadge key={s} source={s} />
            ))}
          </div>
          <div className="mt-2 text-[12px] text-muted">
            Freshness: <span className="text-text">{m.freshnessSLA}</span>
          </div>
        </div>
      </div>
    </span>
  );
}
