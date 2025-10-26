import type { MovementEntry } from "@/webapp/src/lib/api/pitcherDeepDive";
import { getPitchColor } from "./chartColors";

export interface MovementScatterPlotProps {
  data: MovementEntry[];
}

export function MovementScatterPlot({ data }: MovementScatterPlotProps) {
  const usable = data.filter(entry => entry.horz !== undefined && entry.vert !== undefined);
  if (!usable.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
        Movement data unavailable.
      </div>
    );
  }

  const xs = usable.map(entry => entry.horz ?? 0);
  const ys = usable.map(entry => entry.vert ?? 0);
  const minX = Math.min(...xs, -20);
  const maxX = Math.max(...xs, 20);
  const minY = Math.min(...ys, -20);
  const maxY = Math.max(...ys, 20);

  const width = 360;
  const height = 260;
  const padding = 40;

  const scaleX = (value: number) => {
    return padding + ((value - minX) / (maxX - minX || 1)) * (width - padding * 2);
  };
  const scaleY = (value: number) => {
    return height - padding - ((value - minY) / (maxY - minY || 1)) * (height - padding * 2);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h4 className="mb-4 text-sm font-semibold uppercase tracking-widest text-white/60">Horizontal vs. Vertical Break</h4>
      <div className="flex flex-col gap-6 lg:flex-row">
        <svg width={width} height={height} className="rounded-xl bg-slate-950/60">
          <line x1={padding} y1={scaleY(0)} x2={width - padding} y2={scaleY(0)} stroke="rgba(255,255,255,0.08)" />
          <line x1={scaleX(0)} y1={padding} x2={scaleX(0)} y2={height - padding} stroke="rgba(255,255,255,0.08)" />
          {[...Array(5)].map((_, idx) => {
            const t = idx / 4;
            const vx = minX + (maxX - minX) * t;
            const vy = minY + (maxY - minY) * t;
            return (
              <g key={idx} className="text-[11px] text-white/50">
                <text x={scaleX(vx)} y={height - padding + 18} textAnchor="middle">{vx.toFixed(1)}"</text>
                <text x={padding - 18} y={scaleY(vy)} textAnchor="end" alignmentBaseline="middle">{vy.toFixed(1)}"</text>
              </g>
            );
          })}
          {usable.map(entry => {
            const x = scaleX(entry.horz ?? 0);
            const y = scaleY(entry.vert ?? 0);
            const color = getPitchColor(entry.pitch_type);
            const size = Math.min(12, 4 + (entry.count ?? 0) / 30);
            return (
              <g key={entry.pitch_type}>
                <circle cx={x} cy={y} r={size} fill={color} opacity={0.9} />
                <text x={x} y={y - size - 4} textAnchor="middle" className="text-[10px] fill-white/80">
                  {entry.pitch_type}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="flex-1 space-y-3">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-white/60">Legend</h5>
          <ul className="space-y-2">
            {usable.map(entry => (
              <li key={entry.pitch_type} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/80">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: getPitchColor(entry.pitch_type) }} />
                  <span className="font-medium">{entry.pitch_type}</span>
                </div>
                <div className="text-xs text-white/50">
                  Horz {entry.horz?.toFixed(1)}" · Vert {entry.vert?.toFixed(1)}" · Velo {entry.velo?.toFixed(1)} mph
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default MovementScatterPlot;
