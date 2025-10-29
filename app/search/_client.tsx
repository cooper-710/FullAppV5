'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { useAppState } from '@/lib/state';
import { useRoster } from '@/lib/hooks/useRoster';

type RosterPlayer = NonNullable<ReturnType<typeof useRoster>['players']>[number];

function formatStat(value: number | string | undefined, digits = 1) {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'string') {
    const normalized = Number(value);
    if (!Number.isNaN(normalized)) {
      return normalized.toFixed(digits);
    }
    return value;
  }
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function pickSourceStat(player: RosterPlayer, source: 'fangraphs' | 'baseball-savant', key: string) {
  const snapshot = player?.sources.find((s) => s.source === source);
  if (!snapshot) return undefined;
  const stat = snapshot.stats[key];
  return typeof stat === 'number' || typeof stat === 'string' ? stat : undefined;
}

export function SearchClient() {
  const { teamKey } = useAppState();
  const { players, error } = useRoster(teamKey);
  const roster = useMemo(() => players ?? [], [players]);

  return (
    <div className="space-y-4">
      <div className="eyebrow">Team</div>
      <div className="text-sm text-muted">Showing players for <span className="text-text font-medium">{teamKey}</span></div>

      {error && (
        <div className="text-sm text-red-400">Failed to load roster: {error.message}</div>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        {roster.length === 0 && !error && (
          <div className="col-span-full text-sm text-muted">Loading roster…</div>
        )}
        {roster.map(p => {
          const base = p.kind === 'pitcher' ? '/scouting/pitchers' : '/scouting/hitters';
          const fgPrimary = p.kind === 'pitcher' ? pickSourceStat(p, 'fangraphs', 'ERA') : pickSourceStat(p, 'fangraphs', 'wRC+');
          const savantEv = pickSourceStat(p, 'baseball-savant', 'avg_hit_speed');
          const fgLabel = p.kind === 'pitcher' ? 'ERA' : 'wRC+';
          return (
            <div key={p.id} className="card p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{p.name} <span className="text-muted">· {p.kind}</span></div>
                <div className="text-sm text-muted">{p.teamLabel}</div>
                <div className="text-xs text-muted mt-1">
                  <span className="font-mono">FG {fgLabel}: {formatStat(fgPrimary, p.kind === 'pitcher' ? 2 : 0)}</span>
                  <span className="mx-2">·</span>
                  <span className="font-mono">Savant EV: {formatStat(savantEv, 1)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Link href={`${base}/${p.id}/story`} className="px-3 h-9 rounded-md border border-border bg-surface2 text-sm flex items-center">Story</Link>
                <Link href={`${base}/${p.id}/deep-dive`} className="px-3 h-9 rounded-md bg-accent text-black text-sm font-medium flex items-center">Deep Dive</Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
