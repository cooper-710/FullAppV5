import type { VelocityEntry } from "@/webapp/src/lib/api/pitcherDeepDive";
import { getPitchColor } from "./chartColors";

export interface VelocityTrendChartProps {
  data: VelocityEntry[];
}

export function VelocityTrendChart({ data }: VelocityTrendChartProps) {
  const usable = data
    .map(entry => ({
      ...entry,
      dateObj: new Date(entry.date),
    }))
    .filter(entry => !Number.isNaN(entry.dateObj.getTime()) && entry.velo !== null && entry.velo !== undefined);

  if (!usable.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
        Velocity trend unavailable.
      </div>
    );
  }

  usable.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

  const minDate = usable[0].dateObj;
  const maxDate = usable[usable.length - 1].dateObj;
  const minVelo = Math.min(...usable.map(entry => entry.velo ?? 0)) - 1;
  const maxVelo = Math.max(...usable.map(entry => entry.velo ?? 0)) + 1;

  const pitchTypes = Array.from(new Set(usable.map(entry => entry.pitch_type)));

  const width = 420;
  const height = 260;
  const padding = 48;

  const dateRange = maxDate.getTime() - minDate.getTime() || 1;
  const veloRange = maxVelo - minVelo || 1;

  const scaleX = (date: Date) =>
    padding + ((date.getTime() - minDate.getTime()) / dateRange) * (width - padding * 2);
  const scaleY = (velo: number) =>
    height - padding - ((velo - minVelo) / veloRange) * (height - padding * 2);

  const axesTicks = 4;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h4 className="mb-4 text-sm font-semibold uppercase tracking-widest text-white/60">Velocity Trend</h4>
      <div className="flex flex-col gap-6 lg:flex-row">
        <svg width={width} height={height} className="rounded-xl bg-slate-950/60">
          <line
            x1={padding}
            y1={height - padding}
            x2={width - padding}
            y2={height - padding}
            stroke="rgba(255,255,255,0.1)"
          />
          <line
            x1={padding}
            y1={padding}
            x2={padding}
            y2={height - padding}
            stroke="rgba(255,255,255,0.1)"
          />

          {[...Array(axesTicks + 1)].map((_, idx) => {
            const t = idx / axesTicks;
            const vx = minVelo + veloRange * t;
            const y = scaleY(vx);
            return (
              <g key={`y-${idx}`}>
                <line
                  x1={padding}
                  y1={y}
                  x2={width - padding}
                  y2={y}
                  stroke="rgba(255,255,255,0.05)"
                  strokeDasharray="3 6"
                />
                <text
                  x={padding - 8}
                  y={y}
                  textAnchor="end"
                  alignmentBaseline="middle"
                  className="text-[11px] fill-white/60"
                >
                  {vx.toFixed(1)} mph
                </text>
              </g>
            );
          })}

          {[...Array(axesTicks + 1)].map((_, idx) => {
            const t = idx / axesTicks;
            const date = new Date(minDate.getTime() + dateRange * t);
            const x = scaleX(date);
            return (
              <g key={`x-${idx}`}>
                <line
                  x1={x}
                  y1={padding}
                  x2={x}
                  y2={height - padding}
                  stroke="rgba(255,255,255,0.04)"
                  strokeDasharray="4 7"
                />
                <text
                  x={x}
                  y={height - padding + 18}
                  textAnchor="middle"
                  className="text-[11px] fill-white/60"
                >
                  {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </text>
              </g>
            );
          })}

          {pitchTypes.map(pitch => {
            const series = usable.filter(entry => entry.pitch_type === pitch);
            if (series.length < 2) return null;
            const points = series
              .map(entry => {
                const x = scaleX(entry.dateObj);
                const y = scaleY(entry.velo ?? 0);
                return `${x},${y}`;
              })
              .join(" ");
            return (
              <polyline
                key={pitch}
                points={points}
                fill="none"
                stroke={getPitchColor(pitch)}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.85}
              />
            );
          })}

          {usable.map(entry => {
            const x = scaleX(entry.dateObj);
            const y = scaleY(entry.velo ?? 0);
            return (
              <circle
                key={`${entry.pitch_type}-${entry.date}`}
                cx={x}
                cy={y}
                r={3.5}
                fill={getPitchColor(entry.pitch_type)}
              />
            );
          })}
        </svg>
        <div className="flex-1 space-y-3">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-white/60">Legend</h5>
          <ul className="space-y-2">
            {pitchTypes.map(pitch => {
              const latest = usable
                .filter(entry => entry.pitch_type === pitch)
                .slice(-1)[0];
              return (
                <li
                  key={pitch}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/80"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: getPitchColor(pitch) }} />
                    <span className="font-medium">{pitch}</span>
                  </div>
                  <span className="text-xs text-white/50">
                    Recent: {latest?.velo?.toFixed(1) ?? "—"} mph ({latest?.date ?? ""})
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default VelocityTrendChart;
