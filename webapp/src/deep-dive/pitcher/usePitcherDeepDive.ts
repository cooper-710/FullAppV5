import { useCallback, useEffect, useRef, useState } from "react";
import {
  type PitcherDeepDive,
  type PitcherRollup,
  type PitcherSpan,
  fetchPitcherDeepDive,
} from "@/webapp/src/lib/api/pitcherDeepDive";

type Status = "idle" | "loading" | "refreshing" | "resolved" | "error";

export interface UsePitcherDeepDiveOptions {
  mlbam: number | null;
  year: number;
  span: PitcherSpan;
  rollup: PitcherRollup;
  enabled?: boolean;
}

export interface UsePitcherDeepDiveResult {
  data: PitcherDeepDive | null;
  status: Status;
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  refresh: () => void;
  lastUpdated: number | null;
}

export function usePitcherDeepDive({
  mlbam,
  year,
  span,
  rollup,
  enabled = true,
}: UsePitcherDeepDiveOptions): UsePitcherDeepDiveResult {
  const [data, setData] = useState<PitcherDeepDive | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const staleRef = useRef<PitcherDeepDive | null>(null);

  const refresh = useCallback(() => {
    setVersion(v => v + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !mlbam) return;
    let active = true;
    const controller = new AbortController();
    setStatus(prev => {
      if (prev === "resolved" && data) return "refreshing";
      return "loading";
    });
    setError(null);

    const run = async () => {
      try {
        const next = await fetchPitcherDeepDive({
          mlbam,
          year,
          span,
          rollup,
          signal: controller.signal,
        });
        if (!active) return;
        staleRef.current = next;
        setData(next);
        setStatus("resolved");
        setLastUpdated(Date.now());
      } catch (err) {
        if (!active) return;
        if ((err as any)?.name === "AbortError") {
          return;
        }
        setError(err as Error);
        if (staleRef.current) {
          setData(staleRef.current);
          setStatus("resolved");
        } else {
          setData(null);
          setStatus("error");
        }
      }
    };

    run();

    return () => {
      active = false;
      controller.abort();
    };
  }, [mlbam, year, span, rollup, enabled, version]);

  return {
    data,
    status,
    isLoading: status === "loading" || (status === "idle" && enabled && !!mlbam),
    isRefreshing: status === "refreshing",
    error,
    refresh,
    lastUpdated,
  };
}

export default usePitcherDeepDive;
