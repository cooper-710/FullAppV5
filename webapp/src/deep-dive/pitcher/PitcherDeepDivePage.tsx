"use client";

import { useEffect, useMemo, useState } from "react";
import DataTable from "@/webapp/src/components/pitcher/DataTable";
import PitchMixDonut from "@/webapp/src/components/pitcher/PitchMixDonut";
import MovementScatterPlot from "@/webapp/src/components/pitcher/MovementScatterPlot";
import VelocityTrendChart from "@/webapp/src/components/pitcher/VelocityTrendChart";
import {
  type PitcherRollup,
  type PitcherSpan,
} from "@/webapp/src/lib/api/pitcherDeepDive";
import usePitcherDeepDive from "./usePitcherDeepDive";

type PitcherHit = { id: number; name: string };

const spanOptions: { value: PitcherSpan; label: string }[] = [
  { value: "regular", label: "Regular Season" },
  { value: "postseason", label: "Postseason" },
  { value: "total", label: "Regular + Postseason" },
];

const rollupOptions: { value: PitcherRollup; label: string }[] = [
  { value: "season", label: "Single Season" },
  { value: "last3", label: "Last 3 Seasons" },
  { value: "career", label: "Career" },
];

const FALLBACK_NAMES = ["Gerrit Cole", "Corbin Burnes", "Tyler Glasnow"];

function lastUpdatedLabel(timestamp: number | null): string {
  if (!timestamp) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).format(timestamp);
}

async function lookupPitcher(query: string): Promise<PitcherHit | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    return { id: Number(trimmed), name: trimmed };
  }
  const res = await fetch(`/api/biolab/pitchers/search?q=${encodeURIComponent(trimmed)}`);
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = (await res.json()) as { items?: { id: number; name: string }[] };
  const first = data.items?.[0];
  if (first) return { id: first.id, name: first.name ?? trimmed };
  return null;
}

interface TabConfig {
  id: string;
  label: string;
  content: React.ReactNode;
  disabled?: boolean;
  badge?: string;
}

export default function PitcherDeepDivePage() {
  const currentYear = new Date().getFullYear();
  const [query, setQuery] = useState(FALLBACK_NAMES[0]);
  const [year, setYear] = useState(currentYear);
  const [span, setSpan] = useState<PitcherSpan>("regular");
  const [rollup, setRollup] = useState<PitcherRollup>("season");
  const [selected, setSelected] = useState<PitcherHit | null>(null);
const [searching, setSearching] = useState(false);
const [searchError, setSearchError] = useState<string | null>(null);

  const { data, isLoading, isRefreshing, error, refresh, lastUpdated } = usePitcherDeepDive({
  mlbam: selected?.id ?? null,
    year,
    span,
    rollup,
    enabled: Boolean(selected),
  });

  const metaMissing = data?.meta?.missing ?? {};
  const filenamePrefix = useMemo(() => {
    const name = selected?.name?.replace(/\s+/g, "_") ?? "pitcher";
    return `${name}_${year}_${span}_${rollup}`;
  }, [selected?.name, year, span, rollup]);

  const tabs: TabConfig[] = useMemo(() => {
    if (!data) return [];
    return [
      {
        id: "standard",
        label: "Standard",
        content: (
          <DataTable
            title="FanGraphs Standard"
            rows={data.standard}
            filename={`${filenamePrefix}_standard.csv`}
            missing={metaMissing.standard}
            isLoading={isRefreshing}
          />
        ),
      },
      {
        id: "advanced",
        label: "Advanced",
        content: (
          <DataTable
            title="FanGraphs Advanced"
            rows={data.advanced}
            filename={`${filenamePrefix}_advanced.csv`}
            missing={metaMissing.advanced}
            isLoading={isRefreshing}
          />
        ),
      },
      {
        id: "statcast",
        label: "Statcast",
        content: (
          <div className="space-y-6">
            <DataTable
              title="Statcast Overview"
              rows={data.statcast}
              filename={`${filenamePrefix}_statcast.csv`}
              missing={metaMissing.statcast}
              isLoading={isRefreshing}
            />
            <PitchMixDonut data={data.pitch_type_mix} />
            <MovementScatterPlot data={data.movement_scatter} />
            <VelocityTrendChart data={data.pitch_velocity} />
          </div>
        ),
      },
      {
        id: "batted_ball",
        label: "Batted Ball",
        content: (
          <DataTable
            title="Batted Ball Profile"
            rows={data.batted_ball}
            filename={`${filenamePrefix}_batted_ball.csv`}
            missing={metaMissing.batted_ball}
            isLoading={isRefreshing}
          />
        ),
      },
      {
        id: "win_prob",
        label: "Win Probability",
        content: (
          <DataTable
            title="Win Probability Added"
            rows={data.win_prob}
            filename={`${filenamePrefix}_win_prob.csv`}
            missing={metaMissing.win_prob}
            isLoading={isRefreshing}
          />
        ),
      },
      {
        id: "pitch_values",
        label: "Pitch Values",
        content: (
          <DataTable
            title="Pitch Run Values"
            rows={data.pitch_values}
            filename={`${filenamePrefix}_pitch_values.csv`}
            missing={metaMissing.pitch_values}
            isLoading={isRefreshing}
          />
        ),
      },
      {
        id: "pitch_usage",
        label: "Pitch Usage",
        content: (
          <div className="space-y-6">
            <DataTable
              title="Pitch Usage & Velo"
              rows={data.pitch_type_velo}
              filename={`${filenamePrefix}_pitch_usage.csv`}
              missing={metaMissing.pitch_type_velo}
              isLoading={isRefreshing}
            />
            <DataTable
              title="Pitch Type Splits"
              rows={data.pitch_type_splits}
              filename={`${filenamePrefix}_pitch_type_splits.csv`}
              missing={metaMissing.pitch_type_splits}
              isLoading={isRefreshing}
              compact
            />
          </div>
        ),
      },
      {
        id: "plate_discipline",
        label: "Plate Discipline",
        content: (
          <DataTable
            title="Plate Discipline"
            rows={data.plate_discipline}
            filename={`${filenamePrefix}_plate_discipline.csv`}
            missing={metaMissing.plate_discipline}
            isLoading={isRefreshing}
          />
        ),
      },
      {
        id: "pitchingbot",
        label: "PitchingBot",
        content: (
          <DataTable
            title="PitchingBot"
            rows={data.pitchingbot}
            filename={`${filenamePrefix}_pitchingbot.csv`}
            missing={metaMissing.pitchingbot}
            isLoading={isRefreshing}
          />
        ),
      },
      {
        id: "value",
        label: "Value",
        content: (
          <DataTable
            title="Value & WAR"
            rows={data.value}
            filename={`${filenamePrefix}_value.csv`}
            missing={metaMissing.value}
            isLoading={isRefreshing}
          />
        ),
      },
      {
        id: "splits",
        label: "Splits",
        content: (
          <DataTable
            title="Statcast Splits"
            rows={data.splits}
            filename={`${filenamePrefix}_splits.csv`}
            missing={metaMissing.splits}
            isLoading={isRefreshing}
          />
        ),
      },
      {
        id: "game_log",
        label: "Game Log",
        content: (
          <DataTable
            title="Game Log Summary"
            rows={data.game_log}
            filename={`${filenamePrefix}_game_log.csv`}
            missing={metaMissing.game_log}
            isLoading={isRefreshing}
            compact
          />
        ),
      },
      {
        id: "graphs",
        label: "Graphs",
        content: (
          <DataTable
            title="Season-over-Season Trends"
            rows={data.player_graphs}
            filename={`${filenamePrefix}_graphs.csv`}
            missing={metaMissing.player_graphs}
            isLoading={isRefreshing}
          />
        ),
      },
    ];
  }, [data, filenamePrefix, metaMissing, isRefreshing]);

  const [activeTab, setActiveTab] = useState<string>(() => tabs[0]?.id ?? "standard");
  useEffect(() => {
    if (!tabs.length) return;
    if (!tabs.find(tab => tab.id === activeTab)) {
      setActiveTab(tabs[0]?.id ?? "standard");
    }
  }, [tabs, activeTab]);

const handleSearch = async (evt?: React.FormEvent) => {
    evt?.preventDefault();
    setSearchError(null);
    setSearching(true);
    try {
      const hit = await lookupPitcher(query);
      if (!hit) {
        setSearchError("No pitcher found for that query.");
        setSelected(null);
      } else {
        setSelected(hit);
      }
    } catch (err) {
      setSearchError((err as Error).message);
      setSelected(null);
    } finally {
      setSearching(false);
    }
  };

  const showSkeleton = isLoading && !data;

  useEffect(() => {
    let active = true;
    (async () => {
      setSearching(true);
      try {
        const initial = await lookupPitcher(query);
        if (active && initial) {
          setSelected(initial);
        }
      } catch (err) {
        if (active) setSearchError((err as Error).message);
      } finally {
        if (active) setSearching(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/20">
        <form onSubmit={handleSearch} className="grid gap-4 md:grid-cols-[3fr,1fr,1fr,auto] md:items-end">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-white/60">Pitcher</label>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white outline-none transition focus:border-white/30 focus:ring-2 focus:ring-orange-500/40"
              placeholder="Name or MLBAM ID"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-white/60">Season</label>
            <input
              type="number"
              min={1900}
              max={currentYear + 1}
              value={year}
              onChange={e => setYear(Number(e.target.value) || currentYear)}
              className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white outline-none transition focus:border-white/30 focus:ring-2 focus:ring-orange-500/40"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-white/60">Span</label>
            <select
              value={span}
              onChange={e => setSpan(e.target.value as PitcherSpan)}
              className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white outline-none transition focus:border-white/30 focus:ring-2 focus:ring-orange-500/40"
            >
              {spanOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-white/60">Rollup</label>
            <select
              value={rollup}
              onChange={e => setRollup(e.target.value as PitcherRollup)}
              className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white outline-none transition focus:border-white/30 focus:ring-2 focus:ring-orange-500/40"
            >
              {rollupOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-2xl bg-orange-500 px-5 py-2 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:opacity-60"
            disabled={searching}
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </form>
        {searchError && <div className="mt-3 text-sm text-rose-300">{searchError}</div>}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/50">
          Quick pick:
          {FALLBACK_NAMES.map(name => (
            <button
              key={name}
              type="button"
              onClick={() => setQuery(name)}
              className="rounded-full border border-white/10 px-3 py-1 text-white/70 transition hover:border-white/30 hover:text-white"
            >
              {name}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-white/60">Pitcher</div>
            <div className="text-2xl font-semibold text-white">
              {selected?.name || "Select a pitcher"}
            </div>
            {data?.meta?.player && (
              <div className="mt-2 flex flex-wrap gap-3 text-sm text-white/60">
                <span>Throws {data.meta.player.throws ?? "—"}</span>
                <span>Bats {data.meta.player.bats ?? "—"}</span>
                <span>Height {data.meta.player.height ?? "—"}</span>
                <span>Weight {data.meta.player.weight ?? "—"}</span>
                <span>Age {data.meta.player.age ?? "—"}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60">
              Last updated: {lastUpdatedLabel(lastUpdated)}
            </div>
            <button
              type="button"
              onClick={refresh}
              className="rounded-2xl border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 transition hover:border-white/40 hover:text-white disabled:opacity-60"
              disabled={isLoading || !selected}
            >
              Refresh
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error.message}
          </div>
        )}
      </section>

      {showSkeleton && (
        <div className="space-y-4">
          {[...Array(4)].map((_, idx) => (
            <div key={idx} className="h-40 animate-pulse rounded-3xl border border-white/10 bg-white/5" />
          ))}
        </div>
      )}

      {!data && !showSkeleton && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-12 text-center text-sm text-white/60">
          Search a pitcher to load deep dive data.
        </div>
      )}

      {data && (
        <section className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                disabled={tab.disabled}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  activeTab === tab.id
                    ? "bg-white text-slate-900"
                    : "border border-white/10 bg-white/5 text-white/70 hover:border-white/30 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="space-y-6">
            {tabs
              .filter(tab => tab.id === activeTab)
              .map(tab => (
                <div key={tab.id} className="space-y-6">
                  {tab.content}
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
