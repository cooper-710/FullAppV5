import { useMemo, useState } from "react";
import type { DataRow } from "@/webapp/src/lib/api/pitcherDeepDive";

const PRIORITY_KEYS = ["season", "pitch_type", "handedness", "date"];

function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    if (value.includes(",") || value.includes("\"")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
  if (typeof value === "number") return `${value}`;
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value);
}

function downloadCsv(rows: DataRow[], columns: string[], filename: string) {
  const header = columns.join(",");
  const lines = rows.map(row => columns.map(col => toCsvValue(row[col])).join(","));
  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function numberFormat(value: number): string {
  if (!Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  if (abs === 0) return "0";
  if (abs < 0.01) return value.toPrecision(3);
  if (abs < 1) return value.toFixed(3);
  if (abs < 10) return value.toFixed(2);
  if (abs < 1000) return value.toFixed(1);
  return value.toLocaleString();
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.\-]+/g, "");
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return numberFormat(value);
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function determineColumns(rows: DataRow[]): string[] {
  const order = new Map<string, number>();
  const keys = new Set<string>();
  rows.forEach(row => {
    Object.keys(row).forEach(key => {
      keys.add(key);
      if (!order.has(key)) {
        const priorityIndex = PRIORITY_KEYS.indexOf(key);
        order.set(key, priorityIndex >= 0 ? priorityIndex : PRIORITY_KEYS.length + order.size);
      }
    });
  });
  const columns = Array.from(keys);
  columns.sort((a, b) => {
    const pa = order.get(a) ?? 999;
    const pb = order.get(b) ?? 999;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
  return columns;
}

export interface DataTableProps {
  title: string;
  rows: DataRow[];
  filename: string;
  missing?: boolean;
  isLoading?: boolean;
  compact?: boolean;
}

export function DataTable({
  title,
  rows,
  filename,
  missing = false,
  isLoading = false,
  compact = false,
}: DataTableProps) {
  const columns = useMemo(() => determineColumns(rows), [rows]);
  const [sortKey, setSortKey] = useState<string | null>(columns[0] ?? null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const na = coerceNumber(av);
      const nb = coerceNumber(bv);
      if (na !== null && nb !== null) {
        return sortDir === "asc" ? na - nb : nb - na;
      }
      const sa = formatCell(av);
      const sb = formatCell(bv);
      return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
  }, [rows, sortKey, sortDir]);

  if (!rows.length && isLoading) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-white/60">{title}</h3>
          <div className="h-2 w-20 animate-pulse rounded-full bg-white/10" />
        </header>
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-8 w-full animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      </section>
    );
  }

  if (!rows.length) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-white/60">{title}</h3>
        </header>
        <div className="text-sm text-white/60">
          {missing ? "Section is unavailable for this selection." : "No data available."}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-widest text-white/60">{title}</h3>
          {isLoading && (
            <span className="text-xs text-white/50">Refreshing…</span>
          )}
        </div>
        <button
          onClick={() => downloadCsv(sortedRows, columns, filename)}
          className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white/70 transition hover:border-white/40 hover:text-white"
        >
          Export CSV
        </button>
      </header>
      <div className="overflow-x-auto">
        <table className={`min-w-full ${compact ? "text-xs" : "text-sm"}`}>
          <thead>
            <tr className="bg-white/5 text-left text-white/70">
              {columns.map(col => (
                <th
                  key={col}
                  onClick={() => {
                    if (sortKey === col) {
                      setSortDir(prev => (prev === "asc" ? "desc" : "asc"));
                    } else {
                      setSortKey(col);
                      setSortDir(col === "season" ? "desc" : "asc");
                    }
                  }}
                  className="cursor-pointer px-4 py-2 text-xs font-semibold uppercase tracking-wide"
                >
                  <span className="flex items-center gap-1">
                    {col}
                    {sortKey === col && (
                      <span aria-hidden className="text-[10px]">
                        {sortDir === "asc" ? "▲" : "▼"}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => (
              <tr
                key={idx}
                className={idx % 2 === 0 ? "bg-transparent" : "bg-white/[0.03]"}
              >
                {columns.map(col => (
                  <td
                    key={col}
                    className="px-4 py-2 text-white/80"
                  >
                    {formatCell(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default DataTable;
