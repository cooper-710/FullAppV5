import type { PitchMixEntry } from "@/webapp/src/lib/api/pitcherDeepDive";
import { getPitchColor } from "./chartColors";

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export interface PitchMixDonutProps {
  data: PitchMixEntry[];
}

export function PitchMixDonut({ data }: PitchMixDonutProps) {
  const usable = data.filter(entry => (entry.usage_pct ?? 0) > 0);
  if (!usable.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
        Pitch mix data unavailable.
      </div>
    );
  }

  const total = usable.reduce((sum, entry) => sum + (entry.usage_pct ?? 0), 0);
  let accum = 0;
  const segments = usable.map(entry => {
    const portion = total ? (entry.usage_pct ?? 0) / total : 0;
    const start = accum;
    const end = start + portion;
    accum = end;
    const color = getPitchColor(entry.pitch_type);
    return {
      ...entry,
      start,
      end,
      color,
    };
  });
  const gradient = segments
    .map(seg => {
      const s = Math.round(seg.start * 10000) / 100;
      const e = Math.round(seg.end * 10000) / 100;
      return `${seg.color} ${s}% ${e}%`;
    })
    .join(", ");

  return (
    <div className="grid gap-6 rounded-2xl border border-white/10 bg-white/5 p-6 md:grid-cols-[200px,1fr]">
      <div
        className="mx-auto h-44 w-44 rounded-full border border-white/10"
        style={{ background: `conic-gradient(${gradient})` }}
      >
        <div className="relative flex h-full w-full items-center justify-center">
          <div className="h-24 w-24 rounded-full border border-white/10 bg-slate-950/80 shadow-inner" />
        </div>
      </div>
      <div className="space-y-3">
        <h4 className="text-sm font-semibold uppercase tracking-widest text-white/60">Pitch Mix Usage</h4>
        <ul className="space-y-2">
          {segments.map(seg => (
            <li key={seg.pitch_type} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: seg.color }} />
                <div>
                  <div className="text-sm font-medium text-white/80">{seg.pitch_type}</div>
                  <div className="text-xs text-white/50">
                    {seg.count ?? 0} pitches · Avg Velo {seg.avg_velo ? `${seg.avg_velo.toFixed(1)} mph` : "—"}
                  </div>
                </div>
              </div>
              <div className="text-sm font-semibold text-white/85">{formatPct(seg.usage_pct)}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default PitchMixDonut;
