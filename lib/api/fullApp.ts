import type { NextOpponent } from '@/data/schedule';
import type { Player } from '@/lib/entities';
import type { MetricDef } from '@/lib/types';
import type { TeamOption } from '@/lib/app-options';

const BASE = '/api/full-app';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  const text = await res.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (err) {
    if (!res.ok) {
      throw new Error(`API error ${res.status} on ${path}: ${text.slice(0, 200)}`);
    }
    throw err;
  }

  if (!res.ok) {
    const detail = payload?.error ? `: ${payload.error}` : '';
    throw new Error(`API error ${res.status} on ${path}${detail}`);
  }

  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data as T;
  }
  return payload as T;
}

export function fetchNextOpponent(teamKey: string, signal?: AbortSignal) {
  const qs = new URLSearchParams({ teamKey });
  return request<NextOpponent>(`/gameday/next-opponent?${qs.toString()}`, { signal });
}

type PlayerQuery = { teamKey?: string; season?: number };

function buildQuery(params?: PlayerQuery) {
  const search = new URLSearchParams();
  if (params?.teamKey) search.set('teamKey', params.teamKey);
  if (params?.season) search.set('season', String(params.season));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function fetchPlayers(params?: PlayerQuery, signal?: AbortSignal) {
  return request<Player[]>(`/players${buildQuery(params)}`, { signal });
}

export function fetchPlayer(playerId: string, params?: PlayerQuery, signal?: AbortSignal) {
  return request<Player>(`/players/${encodeURIComponent(playerId)}${buildQuery(params)}`, { signal });
}

export function fetchMetricDictionary(signal?: AbortSignal) {
  return request<MetricDef[]>(`/metrics/dictionary`, { signal });
}

export function fetchTeamOptions(signal?: AbortSignal) {
  return request<TeamOption[]>(`/options/teams`, { signal });
}
