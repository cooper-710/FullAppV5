"use client";
import { useMemo, useState } from "react";

/* =========================================================
   Types & constants
   ====================================================== */
type Summary = any;
const YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

/* =========================================================
   Utils
   ====================================================== */
function splitName(input: string) {
  const cleaned = input.trim().replace(/\s+/g, " ");
  const parts = cleaned.split(" ");
  const toTitle = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return { first: toTitle(parts[0] || ""), last: toTitle(parts.slice(1).join(" ") || "") };
}
function getFgRows(summary: Summary) {
  const arr = Array.isArray(summary?.fangraphs) ? summary.fangraphs : [];
  return arr.map((r: any) => ({ season: r?.season ?? r?.data?.Season ?? "", data: r?.data ?? {} }));
}
function normKey(k: string) { return String(k).toLowerCase().replace(/[^a-z0-9]/g, ""); }
function parseNumber(v: any) {
  if (v == null) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v
      .replace(/[, ]+/g, "")
      .replace(/[–—−]/g, "-")
      .replace(/\$/g, "")
      .replace(/m(illions)?$/i, "")
      .replace(/^N\/?A$/i, "")
      .replace(/^NA$/i, "")
      .replace(/^null$/i, "")
      .replace(/%$/, "")
      .trim();
    if (cleaned === "" || cleaned === "-") return undefined;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : undefined;
  }
  return undefined;
}
function pick(obj: any, candidates: string[]) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const c of candidates) if (Object.prototype.hasOwnProperty.call(obj, c)) return obj[c];
  for (const c of candidates) {
    const key = Object.keys(obj).find((k) => k.toLowerCase() === c.toLowerCase());
    if (key) return obj[key];
  }
  return undefined;
}
function n(obj: any, keys: string[]) { return parseNumber(pick(obj, keys)); }
function nFuzzy(obj: any, patterns: RegExp[]) {
  if (!obj || typeof obj !== "object") return undefined;
  const keys = Object.keys(obj);
  for (const p of patterns) {
    const k = keys.find((key) => p.test(normKey(key)));
    if (k) {
      const val = parseNumber((obj as any)[k]);
      if (val != null) return val;
    }
  }
  return undefined;
}
function fmt(n: any, d = 1) { if (n == null || Number.isNaN(Number(n))) return ""; return Number(n).toFixed(d); }
function fmt3(n: any) { return fmt(n, 3); }
function pctSmart(v: any) {
  if (v == null || v === "") return "";
  const num = Number(v);
  if (!Number.isFinite(num)) return "";
  return `${(Math.abs(num) <= 1 ? num * 100 : num).toFixed(1)}%`;
}
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const mean = (a: number[]) => (a.length ? sum(a) / a.length : undefined);
const pushIf = (arr: number[], v: any) => { const p = parseNumber(v); if (p != null) arr.push(p); };
type Col = { key: string; label: string; kind?: "pct" | "dec3" | "num" | "int" };
function isEmptyValue(v: any) { return v == null || v === "" || (typeof v === "number" && !Number.isFinite(v)); }
function sortValue(_key: string, v: any, kind?: Col["kind"]) {
  if (v == null) return -Infinity;
  if (kind === "pct") return Math.abs(Number(v)) <= 1 ? Number(v) * 100 : Number(v);
  return Number(v);
}
function cellFormat(key: string, v: any, kind?: Col["kind"]) {
  if (v == null) return "";
  if (kind === "pct") return pctSmart(v);
  if (kind === "dec3") return fmt3(v);
  if (kind === "int") return fmt(v, 0);
  if (/%/.test(key) || /(Pct|Rate)$/i.test(key)) return pctSmart(v);
  if (["AVG", "OBP", "SLG", "OPS", "wOBA", "xwOBA", "xBA", "xSLG", "ISO", "BABIP"].includes(key)) return fmt3(v);
  return fmt(v, key === "Spd" ? 1 : 1);
}
const alias = new Map<string, string>([
  ["BB%", "BBp"], ["K%", "Kp"], ["wRC+", "wRCp"],
  ["LD%", "LDpct"], ["GB%", "GBpct"], ["FB%", "FBpct"], ["IFFB%", "IFFBpct"], ["HR/FB", "HRperFB"],
]);

/* =========================================================
   Sorting hook
   ====================================================== */
function useSorted(rows: any[], cols: Col[]) {
  const [sortKey, setSortKey] = useState<string | undefined>();
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = cols.find((c) => c.key === sortKey);
    return [...rows].sort((a, b) => {
      const av = sortValue(sortKey, a[sortKey], col?.kind);
      const bv = sortValue(sortKey, b[sortKey], col?.kind);
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [rows, sortKey, sortDir, cols]);
  function onSort(k: string) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  }
  return { sorted, sortKey, sortDir, onSort };
}

/* =========================================================
   Spinner / Skeleton / Empty states
   ====================================================== */
function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.2" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" fill="none" />
    </svg>
  );
}
function SectionSkeleton({ height = 220 }: { height?: number }) {
  return (
    <section className="space-y-2" aria-hidden>
      <div className="h-4 w-40 bg-neutral-800/70 rounded animate-pulse" />
      <div className="rounded border border-neutral-800 overflow-hidden">
        <div className="h-9 w-full bg-neutral-900/70 border-b border-neutral-800 animate-pulse" />
        <div className="w-full" style={{ height }} >
          <div className="h-full w-full bg-neutral-900/40 animate-pulse" />
        </div>
      </div>
    </section>
  );
}
function EmptyState({
  hasSeasons,
  onQuickSearch,
}: {
  hasSeasons: boolean;
  onQuickSearch: (name: string) => void;
}) {
  return (
    <div className="mt-10 rounded-xl border border-neutral-800 bg-neutral-950/40 p-10 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full border border-neutral-700">
        <svg viewBox="0 0 24 24" width="20" height="20" className="opacity-80">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 8c2 2 2 6 0 8M17 8c-2 2-2 6 0 8" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        </svg>
      </div>
      <h3 className="text-lg font-medium mb-1">Search a player to get started</h3>
      <p className="text-sm opacity-70">
        Type the full name and {hasSeasons ? "press Search" : "pick seasons, then press Search"}.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {["Pete Alonso", "Harrison Bader", "Nolan Arenado"].map((n) => (
          <button
            key={n}
            onClick={() => onQuickSearch(n)}
            className="px-3 py-1 rounded-full border border-orange-500/60 text-orange-400 hover:bg-orange-500/10"
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
function NoResultsState() {
  return (
    <div className="mt-10 rounded-xl border border-neutral-800 bg-neutral-950/40 p-10 text-center">
      <h3 className="text-lg font-medium mb-1">No stats for these seasons</h3>
      <p className="text-sm opacity-70">Try different seasons or another player.</p>
    </div>
  );
}

/* =========================================================
   Table
   ====================================================== */
function Table({
  title, rows, cols, sumKeys = [], avgKeys = [], footAlias = alias,
  autoPrune = true, minNonEmptyPerCol = 1, minDataCols = 2
}: {
  title: string;
  rows: any[];
  cols: Col[];
  sumKeys?: string[];
  avgKeys?: string[];
  footAlias?: Map<string, string>;
  autoPrune?: boolean;
  minNonEmptyPerCol?: number;
  minDataCols?: number;
}): JSX.Element | null {
  const baseRows = rows ?? [];

  // column pruning
  const visibleCols: Col[] = useMemo(() => {
    if (!autoPrune) return cols;
    const counts = new Map<string, number>();
    for (const c of cols) if (c.key !== "season") counts.set(c.key, 0);
    for (const r of baseRows) {
      for (const c of cols) {
        if (c.key === "season") continue;
        const v = (r as any)[c.key];
        if (!isEmptyValue(v)) counts.set(c.key, (counts.get(c.key) ?? 0) + 1);
      }
    }
    return cols.filter((c) => c.key === "season" || (counts.get(c.key) ?? 0) >= minNonEmptyPerCol);
  }, [cols, baseRows, autoPrune, minNonEmptyPerCol]);

  // row pruning
  const prunedRows = useMemo(() => {
    if (!autoPrune) return baseRows;
    const dataKeys = visibleCols.filter((c) => c.key !== "season").map((c) => c.key);
    return baseRows.filter((r) => dataKeys.some((k) => !isEmptyValue((r as any)[k])));
  }, [baseRows, visibleCols, autoPrune]);

  // sort
  const { sorted, sortKey, sortDir, onSort } = useSorted(prunedRows, visibleCols);

  // hide decision
  const dataColCount = visibleCols.filter((c) => c.key !== "season").length;
  const hide = prunedRows.length === 0 || dataColCount < minDataCols;
  if (hide) return null;

  // totals / averages
  const totals: Record<string, number | undefined> = {};
  for (const k of sumKeys) { const vals: number[] = []; for (const r of prunedRows) pushIf(vals, (r as any)[k]); totals[k] = vals.length ? sum(vals) : undefined; }
  for (const k of avgKeys) { const vals: number[] = []; for (const r of prunedRows) pushIf(vals, (r as any)[k]); totals[k] = mean(vals); }

  const tableClass = "min-w-full text-sm";
  const theadClass = "text-left sticky top-0 z-10 bg-neutral-1000/70 backdrop-blur border-b border-neutral-800";
  const thBase = "px-3 py-2 select-none";
  const trClass = "odd:bg-neutral-1000/15 hover:bg-neutral-900/30";
  const numCell = "px-3 py-2 text-right tabular-nums";
  const headBtn = (c: Col) => (
    <th key={c.key} className={thBase}>
      <button
        onClick={() => onSort(c.key)}
        className={`flex items-center gap-1 ${c.key === "season" ? "font-medium" : "opacity-90 hover:opacity-100"} ${sortKey === c.key ? "text-orange-400" : ""}`}
      >
        <span>{c.label}</span>
        {sortKey === c.key ? <span className="text-xs">{sortDir === "asc" ? "▲" : "▼"}</span> : <span className="text-xs opacity-30">↕</span>}
      </button>
    </th>
  );

  return (
    <section className="space-y-2">
      <div className="text-sm opacity-80">{title}</div>
      <div className="rounded border border-neutral-800 overflow-auto">
        <table className={tableClass}>
          <thead className={theadClass}>
            <tr>{visibleCols.map(headBtn)}</tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={(r as any).season ?? i} className={trClass}>
                {visibleCols.map((c) => (
                  <td key={c.key} className={c.key === "season" ? "px-3 py-2 text-left font-medium" : numCell}>
                    {c.key === "season" ? (r as any)[c.key] : cellFormat(c.key, (r as any)[c.key], c.kind)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-neutral-800 bg-neutral-900/40 font-semibold">
              {visibleCols.map((c, idx) => {
                if (idx === 0) return <td key={c.key} className="px-3 py-2">Totals</td>;
                const k = totals[c.key] !== undefined ? c.key : (alias.get(c.key) ?? c.key);
                return <td key={c.key} className={numCell}>{cellFormat(c.key, totals[k], c.kind)}</td>;
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* =========================================================
   Page
   ====================================================== */
export default function HittersDeepDiveSearch() {
  // Start with a blank input as requested
  const [name, setName] = useState("");
  const [years, setYears] = useState<number[]>([2025]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");
  const [data, setData] = useState<Summary | null>(null);

  function toggle(y: number) {
    setYears((prev) => {
      const s = new Set(prev); s.has(y) ? s.delete(y) : s.add(y);
      return Array.from(s).sort((a, b) => a - b);
    });
  }
  function setAllYears() { setYears([...YEARS]); }
  function clearYears() { setYears([]); }

  // Accept override name to avoid stale state (fixes quick-pick double click)
  async function doSearch(overrideName?: string, overrideYears?: number[]) {
    setErr("");
    const targetName = (overrideName ?? name).trim();
    const targetYears = overrideYears ?? years;
    if (!targetName) {
      setErr("Enter a player name");
      return;
    }
    setLoading(true);
    setData(null);
    try {
      const { first, last } = splitName(targetName);
      const qs = targetYears.length ? targetYears.map((y) => `seasons=${y}`).join("&") : `seasons=2025`;
      const res = await fetch(
        `/api/players/${encodeURIComponent(first)}/${encodeURIComponent(last)}/summary?${qs}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setErr(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  const fg = useMemo(() => getFgRows(data), [data]);

  /* ---------- derived tables ---------- */
  const production = useMemo(() => fg.map((r) => {
    const d = r.data;
    let OBP = n(d, ["OBP"]);
    let SLG = n(d, ["SLG"]);
    let OPS = n(d, ["OPS"]);
    if (OPS == null && OBP != null && SLG != null) OPS = OBP + SLG;
    return {
      season: r.season, PA: n(d, ["PA"]), AB: n(d, ["AB"]), H: n(d, ["H"]), R: n(d, ["R"]),
      RBI: n(d, ["RBI"]), HR: n(d, ["HR"]), SB: n(d, ["SB"]),
      BBp: n(d, ["BB%", "BB %"]) ?? nFuzzy(d, [/^bbp?$/]),
      Kp: n(d, ["K%", "SO%", "K %", "SO %"]) ?? nFuzzy(d, [/^kp?$/]),
      AVG: n(d, ["AVG", "BA"]), OBP, SLG, OPS,
      wOBA: n(d, ["wOBA", "woba"]), wRCp: n(d, ["wRC+"]) ?? nFuzzy(d, [/^wrc\+?$/]),
    };
  }), [fg]);

  const qoc = useMemo(() => fg.map((r) => {
    const d = r.data;
    return {
      season: r.season,
      EV: n(d, ["EV", "Avg EV", "Average EV", "AverageEV", "AvgEV"]),
      MaxEV: n(d, ["Max EV", "MaxEV", "EV Max", "Max Exit Velo", "maxEV", "maxEv"]),
      LA: n(d, ["LA", "Avg LA", "Average LA", "AvgLA", "AverageLA", "Launch Angle", "LA°"]),
      HardHitPct: n(d, ["HardHit%", "HardHit %", "HardHitPercent"]) ?? nFuzzy(d, [/hardhit/]),
      BarrelPct: n(d, ["Barrel%", "BRL%", "Barrel %"]) ?? nFuzzy(d, [/barrel.?%/]),
      Barrels: n(d, ["Barrels", "BRL", "Brls"]),
      xwOBA: n(d, ["xwOBA", "xwoba", "xwOBAcon"]) ?? nFuzzy(d, [/^x?woba/]),
      xBA: n(d, ["xBA", "xba"]), xSLG: n(d, ["xSLG", "xslg"]),
    };
  }), [fg]);

  const plate = useMemo(() => fg.map((r) => {
    const d = r.data;
    return {
      season: r.season,
      SwingPct: n(d, ["Swing%", "Swing %"]),
      O_SwingPct: n(d, ["O-Swing%", "O-Swing %", "Chase%", "Chase %"]),
      Z_SwingPct: n(d, ["Z-Swing%", "Z-Swing %"]),
      ContactPct: n(d, ["Contact%", "Contact %"]),
      Z_ContactPct: n(d, ["Z-Contact%", "Z-Contact %", "ZContact%", "Zone Contact%", "ZoneContact%"]),
      SwStrPct: n(d, ["SwStr%", "Whiff%", "SwStr %", "Whiff %"]),
      ZonePct: n(d, ["Zone%", "Zone %"]),
    };
  }), [fg]);

  const batted = useMemo(() => fg.map((r) => {
    const d = r.data;
    return {
      season: r.season,
      LDpct: n(d, ["LD%", "LD %"]), GBpct: n(d, ["GB%", "GB %"]),
      FBpct: n(d, ["FB%", "FB %"]), IFFBpct: n(d, ["IFFB%", "IFFB %"]),
      HRperFB: n(d, ["HR/FB", "HR/FB%", "HR per FB", "HRperFB"]),
      PullPct: n(d, ["Pull%", "Pull %"]), CentPct: n(d, ["Cent%", "Cent %", "Center%"]),
      OppoPct: n(d, ["Oppo%", "Oppo %", "Opp%"]),
    };
  }), [fg]);

  const advanced = useMemo(() => fg.map((r) => {
    const d = r.data;
    const XBR = n(d, ["XBR"]) ?? nFuzzy(d, [/^xbr$/, /extrabaseruns/, /xbaseruns/, /xbrruns/]);
    return {
      season: r.season,
      ISO: n(d, ["ISO"]), BABIP: n(d, ["BABIP"]), Spd: n(d, ["Spd", "SPD"]),
      UBR: n(d, ["UBR"]), wSB: n(d, ["wSB"]), wGDP: n(d, ["wGDP", "wGDP Runs"]),
      XBR, wRC: n(d, ["wRC"]), wRAA: n(d, ["wRAA"]), wOBA: n(d, ["wOBA"]),
    };
  }), [fg]);

  const value = useMemo(() => fg.map((r) => {
    const d = r.data;
    const Batting = n(d, ["Batting", "Bat", "BatRuns", "Batting Runs"]);
    const BaseRunning = n(d, ["Base Running", "BsR", "BsRng", "Bsr"]);
    const Fielding = n(d, ["Fielding", "Fld", "Field"]);
    const Positional = n(d, ["Positional", "Pos"]);
    let Offense = n(d, ["Offense", "Off"]);
    let Defense = n(d, ["Defense", "Def"]);
    if (Offense == null && Batting != null && BaseRunning != null) Offense = Batting + BaseRunning;
    if (Defense == null && Fielding != null && Positional != null) Defense = Fielding + Positional;
    const League = n(d, ["League", "Lg", "League Runs"]) ?? nFuzzy(d, [/^league$/]);
    const Replacement = n(d, ["Replacement", "Rep"]);
    const RAR = n(d, ["RAR"]); const WAR = n(d, ["WAR"]);
    const Dollars = n(d, ["Dollars", "Dollars (millions)"]) ?? nFuzzy(d, [/^dollars?$/]) ?? n(d, ["Salary"]);
    return { season: r.season, Batting, BaseRunning, Fielding, Positional, Offense, Defense, League, Replacement, RAR, WAR, Dollars };
  }), [fg]);

  const insideEdge = useMemo(() => fg.map((r) => {
    const d = r.data;
    return {
      season: r.season,
      ie_impossible: n(d, ["Impossible (0%)"]) ?? nFuzzy(d, [/^impossible.*0/]),
      ie_remote: n(d, ["Remote (1–10%)", "Remote (1-10%)"]) ?? nFuzzy(d, [/^remote/]),
      ie_unlikely: n(d, ["Unlikely (10–40%)", "Unlikely (10-40%)"]) ?? nFuzzy(d, [/^unlikely/]),
      ie_even: n(d, ["Even (40–60%)", "Even (40-60%)"]) ?? nFuzzy(d, [/^even/]),
      ie_likely: n(d, ["Likely (60–90%)", "Likely (60-90%)"]) ?? nFuzzy(d, [/^likely/]),
      ie_routine: n(d, ["Routine (90–100%)", "Routine (90-100%)"]) ?? nFuzzy(d, [/^routine/]),
    };
  }), [fg]);

  const winProb = useMemo(() => fg.map((r) => {
    const d = r.data;
    return {
      season: r.season,
      WPA: n(d, ["WPA"]), mWPA: n(d, ["-WPA"]) ?? nFuzzy(d, [/^-wpa$/]),
      pWPA: n(d, ["+WPA"]) ?? nFuzzy(d, [/^\+wpa$/]),
      RE24: n(d, ["RE24"]), REW: n(d, ["REW"]),
      pLI: n(d, ["pLI"]), phLI: n(d, ["phLI"]),
      WPA_LI: n(d, ["WPA/LI", "WPA per LI"]) ?? nFuzzy(d, [/^wpa.?li$/]),
      Clutch: n(d, ["Clutch"]),
    };
  }), [fg]);

  const fielding = useMemo(() => fg.map((r) => {
    const d = r.data;
    return { season: r.season, Inn: n(d, ["Inn", "INN", "Innings"]), PO: n(d, ["PO"]), A: n(d, ["A"]), E: n(d, ["E"]), DP: n(d, ["DP"]) };
  }), [fg]);

  const advFielding = useMemo(() => fg.map((r) => {
    const d = r.data;
    const uzr150 = n(d, ["UZR/150", "UZR_150", "UZR150"]) ?? nFuzzy(d, [/^uzr.?150$/]);
    return {
      season: r.season,
      rSZ: n(d, ["rSZ", "RSZ"]), rCERA: n(d, ["rCERA"]), rSB: n(d, ["rSB"]), rGDP: n(d, ["rGDP"]), rARM: n(d, ["rARM"]),
      rGFP: n(d, ["rGFP"]), rPM: n(d, ["rPM"]), DRS: n(d, ["DRS"]), ARM: n(d, ["ARM"]), DPR: n(d, ["DPR"]),
      RngR: n(d, ["RngR", "RangeR"]), ErrR: n(d, ["ErrR", "ErrorR"]), UZR: n(d, ["UZR"]), UZR150: uzr150,
      FRM: n(d, ["FRM"]), OAA: n(d, ["OAA"]), FRV: n(d, ["FRV"]),
    };
  }), [fg]);

  /* ---------- helpers for empty/no-results ---------- */
  function hasAnyData(rows: any[]): boolean {
    return rows.some((r: any) => Object.keys(r).some((k) => k !== "season" && !isEmptyValue(r[k])));
  }
  const anyData =
    hasAnyData(production) || hasAnyData(qoc) || hasAnyData(plate) || hasAnyData(batted) ||
    hasAnyData(advanced) || hasAnyData(value) || hasAnyData(insideEdge) ||
    hasAnyData(winProb) || hasAnyData(fielding) || hasAnyData(advFielding);

  /* ---------- UI bits ---------- */
  const yearChip = (y: number, active: boolean, onClick: () => void) => (
    <button
      key={y}
      onClick={onClick}
      disabled={loading}
      className={`px-3 py-1 rounded-full border text-sm transition
      ${active ? "bg-orange-500 border-orange-600 text-black shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
               : "border-orange-500/60 text-orange-400 hover:bg-orange-500/10 disabled:opacity-60"}`}
    >{y}</button>
  );
  const primaryBtn = "px-3 py-2 rounded-md bg-orange-500 hover:bg-orange-600 text-black border border-orange-600 disabled:opacity-60";
  const ghostBtn = "px-3 py-1 rounded-md border border-orange-500/60 text-orange-400 hover:bg-orange-500/10 disabled:opacity-60";

  /* ---------- render ---------- */
  return (
    <div className="px-6 py-6 space-y-8">
      {/* top controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !loading && name.trim()) doSearch(name); }}
          placeholder="First Last"
          disabled={loading}
          className="px-3 py-2 rounded-md border border-neutral-700 bg-transparent w-[320px] disabled:opacity-60"
        />
        <button onClick={() => doSearch(name)} disabled={loading || !name.trim()} className={primaryBtn}>
          {loading ? <span className="inline-flex items-center gap-2"><Spinner className="text-black" /> Loading…</span> : "Search"}
        </button>
        <div className="text-sm opacity-70">{years.length ? `${years.length} seasons` : "No seasons selected"}</div>
        <span className="sr-only" aria-live="polite">{loading ? "Loading player data" : ""}</span>
      </div>

      <div className="flex gap-2 flex-wrap">
        {YEARS.map((y) => yearChip(y, years.includes(y), () => toggle(y)))}
        <button onClick={setAllYears} className={ghostBtn} disabled={loading}>All</button>
        <button onClick={clearYears} className={ghostBtn} disabled={loading}>Clear</button>
      </div>

      {err ? <div className="text-red-400 text-sm">{err}</div> : null}

      {/* BEFORE FIRST SEARCH */}
      {!loading && data === null && (
        <EmptyState
          hasSeasons={years.length > 0}
          onQuickSearch={(n) => { setName(n); doSearch(n); }}
        />
      )}

      {/* LOADING */}
      {loading && (
        <div className="space-y-8">
          <SectionSkeleton />
          <SectionSkeleton />
          <SectionSkeleton />
        </div>
      )}

      {/* AFTER SEARCH: NO USABLE DATA */}
      {!loading && data !== null && !anyData && <NoResultsState />}

      {/* TABLES */}
      {!loading && anyData && (
        <>
          <Table
            title="Production"
            rows={production}
            cols={[
              { key: "season", label: "season" },
              { key: "PA", label: "PA", kind: "int" },
              { key: "AB", label: "AB", kind: "int" },
              { key: "H", label: "H", kind: "int" },
              { key: "R", label: "R", kind: "int" },
              { key: "RBI", label: "RBI", kind: "int" },
              { key: "HR", label: "HR", kind: "int" },
              { key: "SB", label: "SB", kind: "int" },
              { key: "BBp", label: "BB%", kind: "pct" },
              { key: "Kp", label: "K%", kind: "pct" },
              { key: "AVG", label: "AVG", kind: "dec3" },
              { key: "OBP", label: "OBP", kind: "dec3" },
              { key: "SLG", label: "SLG", kind: "dec3" },
              { key: "OPS", label: "OPS", kind: "dec3" },
              { key: "wOBA", label: "wOBA", kind: "dec3" },
              { key: "wRCp", label: "wRC+" },
            ]}
            sumKeys={["PA", "AB", "H", "R", "RBI", "HR", "SB"]}
            avgKeys={["BBp", "Kp", "AVG", "OBP", "SLG", "OPS", "wOBA", "wRCp"]}
          />

          <Table
            title="Quality of Contact"
            rows={qoc}
            cols={[
              { key: "season", label: "season" },
              { key: "EV", label: "EV" },
              { key: "MaxEV", label: "Max EV" },
              { key: "LA", label: "LA" },
              { key: "HardHitPct", label: "HardHit%", kind: "pct" },
              { key: "BarrelPct", label: "Barrel%", kind: "pct" },
              { key: "Barrels", label: "Barrels", kind: "int" },
              { key: "xwOBA", label: "xwOBA", kind: "dec3" },
              { key: "xBA", label: "xBA", kind: "dec3" },
              { key: "xSLG", label: "xSLG", kind: "dec3" },
            ]}
            sumKeys={["Barrels"]}
            avgKeys={["EV", "MaxEV", "LA", "HardHitPct", "BarrelPct", "xwOBA", "xBA", "xSLG"]}
          />

          <Table
            title="Plate Discipline"
            rows={plate}
            cols={[
              { key: "season", label: "season" },
              { key: "SwingPct", label: "Swing%", kind: "pct" },
              { key: "O_SwingPct", label: "O-Swing%", kind: "pct" },
              { key: "Z_SwingPct", label: "Z-Swing%", kind: "pct" },
              { key: "ContactPct", label: "Contact%", kind: "pct" },
              { key: "Z_ContactPct", label: "Z-Contact%", kind: "pct" },
              { key: "SwStrPct", label: "SwStr%", kind: "pct" },
              { key: "ZonePct", label: "Zone%", kind: "pct" },
            ]}
            avgKeys={["SwingPct", "O_SwingPct", "Z_SwingPct", "ContactPct", "Z_ContactPct", "SwStrPct", "ZonePct"]}
          />

          <Table
            title="Batted Ball Profile"
            rows={batted}
            cols={[
              { key: "season", label: "season" },
              { key: "LDpct", label: "LD%", kind: "pct" },
              { key: "GBpct", label: "GB%", kind: "pct" },
              { key: "FBpct", label: "FB%", kind: "pct" },
              { key: "IFFBpct", label: "IFFB%", kind: "pct" },
              { key: "HRperFB", label: "HR/FB", kind: "pct" },
              { key: "PullPct", label: "Pull%", kind: "pct" },
              { key: "CentPct", label: "Cent%", kind: "pct" },
              { key: "OppoPct", label: "Oppo%", kind: "pct" },
            ]}
            avgKeys={["LDpct", "GBpct", "FBpct", "IFFBpct", "HRperFB", "PullPct", "CentPct", "OppoPct"]}
          />

          <Table
            title="Advanced"
            rows={advanced}
            cols={[
              { key: "season", label: "season" },
              { key: "ISO", label: "ISO", kind: "dec3" },
              { key: "BABIP", label: "BABIP", kind: "dec3" },
              { key: "Spd", label: "Spd" },
              { key: "UBR", label: "UBR" },
              { key: "wSB", label: "wSB" },
              { key: "wGDP", label: "wGDP" },
              { key: "XBR", label: "XBR" },
              { key: "wRC", label: "wRC" },
              { key: "wRAA", label: "wRAA" },
              { key: "wOBA", label: "wOBA", kind: "dec3" },
            ]}
            sumKeys={["UBR", "wSB", "wGDP", "XBR", "wRC", "wRAA"]}
            avgKeys={["ISO", "BABIP", "Spd", "wOBA"]}
          />

          <Table
            title="Value"
            rows={value}
            cols={[
              { key: "season", label: "season" },
              { key: "Batting", label: "Batting" },
              { key: "BaseRunning", label: "Base Running" },
              { key: "Fielding", label: "Fielding" },
              { key: "Positional", label: "Positional" },
              { key: "Offense", label: "Offense" },
              { key: "Defense", label: "Defense" },
              { key: "League", label: "League" },
              { key: "Replacement", label: "Replacement" },
              { key: "RAR", label: "RAR" },
              { key: "WAR", label: "WAR" },
              { key: "Dollars", label: "Dollars" },
            ]}
            sumKeys={[
              "Batting", "BaseRunning", "Fielding", "Positional", "Offense", "Defense",
              "League", "Replacement", "RAR", "WAR", "Dollars",
            ]}
          />

          <Table
            title="Inside Edge Fielding"
            rows={insideEdge}
            cols={[
              { key: "season", label: "season" },
              { key: "ie_impossible", label: "Impossible (0%)", kind: "pct" },
              { key: "ie_remote", label: "Remote (1–10%)", kind: "pct" },
              { key: "ie_unlikely", label: "Unlikely (10–40%)", kind: "pct" },
              { key: "ie_even", label: "Even (40–60%)", kind: "pct" },
              { key: "ie_likely", label: "Likely (60–90%)", kind: "pct" },
              { key: "ie_routine", label: "Routine (90–100%)", kind: "pct" },
            ]}
            avgKeys={["ie_impossible", "ie_remote", "ie_unlikely", "ie_even", "ie_likely", "ie_routine"]}
          />

          <Table
            title="Win Probability"
            rows={winProb}
            cols={[
              { key: "season", label: "season" },
              { key: "WPA", label: "WPA" },
              { key: "mWPA", label: "-WPA" },
              { key: "pWPA", label: "+WPA" },
              { key: "RE24", label: "RE24" },
              { key: "REW", label: "REW" },
              { key: "pLI", label: "pLI" },
              { key: "phLI", label: "phLI" },
              { key: "WPA_LI", label: "WPA/LI" },
              { key: "Clutch", label: "Clutch" },
            ]}
            sumKeys={["WPA", "mWPA", "pWPA", "RE24", "REW"]}
            avgKeys={["pLI", "phLI", "WPA_LI", "Clutch"]}
          />

          <Table
            title="Fielding"
            rows={fielding}
            cols={[
              { key: "season", label: "season" },
              { key: "Inn", label: "Inn" },
              { key: "PO", label: "PO" },
              { key: "A", label: "A" },
              { key: "E", label: "E" },
              { key: "DP", label: "DP" },
            ]}
            sumKeys={["Inn", "PO", "A", "E", "DP"]}
          />

          <Table
            title="Advanced Fielding"
            rows={advFielding}
            cols={[
              { key: "season", label: "season" },
              { key: "rSZ", label: "rSZ" },
              { key: "rCERA", label: "rCERA" },
              { key: "rSB", label: "rSB" },
              { key: "rGDP", label: "rGDP" },
              { key: "rARM", label: "rARM" },
              { key: "rGFP", label: "rGFP" },
              { key: "rPM", label: "rPM" },
              { key: "DRS", label: "DRS" },
              { key: "ARM", label: "ARM" },
              { key: "DPR", label: "DPR" },
              { key: "RngR", label: "RngR" },
              { key: "ErrR", label: "ErrR" },
              { key: "UZR", label: "UZR" },
              { key: "UZR150", label: "UZR/150" },
              { key: "FRM", label: "FRM" },
              { key: "OAA", label: "OAA" },
              { key: "FRV", label: "FRV" },
            ]}
            sumKeys={["rSZ", "rCERA", "rSB", "rGDP", "rARM", "rGFP", "rPM", "DRS", "ARM", "DPR", "RngR", "ErrR", "UZR", "UZR150", "FRM", "OAA", "FRV"]}
          />
        </>
      )}
    </div>
  );
}
