import { act, renderHook, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { PitcherDeepDive } from "@/webapp/src/lib/api/pitcherDeepDive";
import { fetchPitcherDeepDive } from "@/webapp/src/lib/api/pitcherDeepDive";
import { usePitcherDeepDive } from "../usePitcherDeepDive";

vi.mock("@/webapp/src/lib/api/pitcherDeepDive", async () => {
  const actual = await vi.importActual<typeof import("@/webapp/src/lib/api/pitcherDeepDive")>("@/webapp/src/lib/api/pitcherDeepDive");
  return {
    ...actual,
    fetchPitcherDeepDive: vi.fn(),
  };
});

const mockResult: PitcherDeepDive = {
  meta: {
    player: {
      fg_id: 123,
      mlbam: 456,
      name: "Test Pitcher",
      throws: "R",
      bats: "R",
    },
    missing: {},
  },
  standard: [{ season: "2024", IP: 100, ERA: 3.12 }],
  advanced: [{ season: "2024", "K/9": 10.1 }],
  statcast: [{ season: "2024", Events: 50 }],
  batted_ball: [{ season: "2024", "GB%": 0.45 }],
  win_prob: [{ season: "2024", WPA: 1.2 }],
  pitch_values: [{ season: "2024", wFB: 8.2 }],
  pitch_type_velo: [{ season: "2024", FBv: 97.4 }],
  plate_discipline: [{ season: "2024", "Zone%": 0.51 }],
  pitchingbot: [{ season: "2024", pb_overall: 55 }],
  fielding_pitcher: [{ season: "2024", "RA9-Wins": 2.1 }],
  value: [{ season: "2024", WAR: 4.5 }],
  player_graphs: [{ season: "2024", ERA: 3.12 }],
  pitch_type_splits: [{ pitch_type: "FF", count: 100, avg_velo: 97.1, avg_spin: 2400, whiff_rate: 0.25, csw: 0.32, avg_iva: 84.5, usage: 0.6 }],
  splits: [{ handedness: "L", pitches: 120, whiff_rate: 0.23, contact_rate: 0.68, avg_velo: 96.5, avg_ev: 88 }],
  pitch_velocity: [{ date: "2024-04-01", pitch_type: "FF", velo: 97.1 }],
  pitch_type_mix: [{ pitch_type: "FF", usage_pct: 0.6, avg_velo: 97.1, whiff_rate: 0.23, count: 120 }],
  movement_scatter: [{ pitch_type: "FF", horz: -8.2, vert: 10.4, velo: 97.1, count: 120 }],
  velo_trend: [{ date: "2024-04-01", pitch_type: "FF", velo: 97.1 }],
  game_log: [{ game_pk: 1, date: "2024-04-01", pitches: 92, whiffs: 18, contacts: 48, avg_velo: 97.1, avg_launch_speed: 88.2, avg_launch_angle: 10.3 }],
};

const fetchMock = fetchPitcherDeepDive as unknown as vi.Mock;

describe("usePitcherDeepDive", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("fetches data successfully", async () => {
    fetchMock.mockResolvedValueOnce(mockResult);

    const { result } = renderHook(() =>
      usePitcherDeepDive({
        mlbam: 456,
        year: 2024,
        span: "regular",
        rollup: "season",
        enabled: true,
      })
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      if (result.current.status === "error") {
        throw result.current.error ?? new Error("request failed");
      }
      expect(result.current.status).toBe("resolved");
    });

    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });
    expect(result.current.data?.standard.length).toBeGreaterThan(0);
  });

  it("falls back to stale data on retryable error", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResult)
      .mockRejectedValueOnce(new Error("server error"));

    const { result } = renderHook(() =>
      usePitcherDeepDive({
        mlbam: 456,
        year: 2024,
        span: "regular",
        rollup: "season",
        enabled: true,
      })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      if (result.current.status === "error") {
        throw result.current.error ?? new Error("request failed");
      }
      expect(result.current.status).toBe("resolved");
    });

    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.error).toBeTruthy();
  });
});
