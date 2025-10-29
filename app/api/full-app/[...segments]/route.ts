import { NextRequest, NextResponse } from 'next/server';
import { getNextOpponent } from '@/data/schedule';
import { STAT_DICTIONARY } from '@/data/stat-dictionary';
import { getTeamOption, listTeamOptions } from '@/lib/app-options';
import type { Player } from '@/lib/entities';
import { fetchTeamFangraphsLeaderboard } from '@/lib/services/fangraphs';
import { fetchTeamStatcast } from '@/lib/services/baseballSavant';

export const dynamic = 'force-dynamic';

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

const HELP = {
  endpoints: [
    '/api/full-app/gameday/next-opponent?teamKey={teamKey}',
    '/api/full-app/players',
    '/api/full-app/players?teamKey={teamKey}',
    '/api/full-app/players/{playerId}',
    '/api/full-app/metrics/dictionary',
    '/api/full-app/options/teams',
  ],
};

type Context = { params: { segments?: string[] } };

const ROSTER_TTL_MS = 15 * 60 * 1000;

type RosterCacheEntry = { expires: number; season: number; players: Player[] };
const rosterCache = new Map<string, RosterCacheEntry>();

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function chooseId(player: Player, teamKey: string): string {
  if (player.mlbamId) return `mlb:${player.mlbamId}`;
  if (player.fangraphsId) return `fg:${player.fangraphsId}`;
  return `${teamKey}:${normalizeName(player.name).replace(/\s+/g, '-')}`;
}

function seasonFromRequest(req: NextRequest): number {
  const seasonParam = req.nextUrl.searchParams.get('season');
  const parsed = seasonParam ? Number(seasonParam) : NaN;
  const currentYear = new Date().getFullYear();
  if (Number.isFinite(parsed) && parsed >= 1900) {
    return parsed;
  }
  return currentYear;
}

function matchPlayerIdentifier(player: Player, value: string): boolean {
  const target = value.trim().toLowerCase();
  if (!target) return false;
  const variants = new Set<string>([
    player.id.toLowerCase(),
    chooseId(player, player.teamKey).toLowerCase(),
  ]);
  if (player.mlbamId) {
    variants.add(String(player.mlbamId));
    variants.add(`mlb:${player.mlbamId}`);
  }
  if (player.fangraphsId) {
    variants.add(String(player.fangraphsId));
    variants.add(`fg:${player.fangraphsId}`);
  }
  for (const variant of variants) {
    if (variant === target) return true;
  }
  return false;
}

async function loadRoster(teamKey: string, season: number): Promise<Player[]> {
  const option = getTeamOption(teamKey);
  if (!option?.fangraphsTeamId || !option.baseballSavantTeam) {
    return [];
  }
  const cacheKey = `${teamKey}:${season}`;
  const now = Date.now();
  const cached = rosterCache.get(cacheKey);
  if (cached && cached.expires > now) {
    return cached.players.map((p) => ({ ...p, sources: p.sources.map((s) => ({ ...s, stats: { ...s.stats } })) }));
  }

  const [fgHitters, fgPitchers, savantHitters, savantPitchers] = await Promise.all([
    fetchTeamFangraphsLeaderboard(option.fangraphsTeamId, season, 'bat'),
    fetchTeamFangraphsLeaderboard(option.fangraphsTeamId, season, 'pit'),
    fetchTeamStatcast(option.baseballSavantTeam, season, 'batter'),
    fetchTeamStatcast(option.baseballSavantTeam, season, 'pitcher'),
  ]);

  const map = new Map<string, Player>();
  const touch = () => new Date().toISOString();

  function ensure(name: string, kind: Player['kind']): Player {
    const key = `${normalizeName(name)}|${kind}`;
    const existing = map.get(key);
    if (existing) {
      if (!existing.name && name) existing.name = name;
      return existing;
    }
    const player: Player = {
      id: '',
      teamKey,
      teamLabel: option.label,
      level: option.level,
      name,
      kind,
      sources: [],
      lastUpdated: touch(),
    };
    map.set(key, player);
    return player;
  }

  for (const row of fgHitters) {
    const player = ensure(row.name, 'hitter');
    if (row.fangraphsId) player.fangraphsId = row.fangraphsId;
    if (row.position) player.position = row.position;
    player.sources.push({ season, source: 'fangraphs', stats: { ...row.stats } });
  }

  for (const row of fgPitchers) {
    const player = ensure(row.name, 'pitcher');
    if (row.fangraphsId) player.fangraphsId = row.fangraphsId;
    if (row.position) player.position = row.position;
    player.sources.push({ season, source: 'fangraphs', stats: { ...row.stats } });
  }

  for (const row of savantHitters) {
    const display = row.formattedName || row.name;
    const player = ensure(display, 'hitter');
    if (Number.isFinite(row.playerId)) player.mlbamId = row.playerId;
    player.sources.push({ season, source: 'baseball-savant', stats: { ...row.metrics } });
  }

  for (const row of savantPitchers) {
    const display = row.formattedName || row.name;
    const player = ensure(display, 'pitcher');
    if (Number.isFinite(row.playerId)) player.mlbamId = row.playerId;
    player.sources.push({ season, source: 'baseball-savant', stats: { ...row.metrics } });
  }

  const players = Array.from(map.values())
    .map((player) => {
      const withId = { ...player };
      withId.id = chooseId(withId, teamKey);
      withId.lastUpdated = touch();
      return withId;
    })
    .sort((a, b) => {
      if (a.kind === b.kind) {
        return a.name.localeCompare(b.name);
      }
      return a.kind === 'hitter' ? -1 : 1;
    });

  rosterCache.set(cacheKey, {
    players,
    season,
    expires: now + ROSTER_TTL_MS,
  });

  return players.map((p) => ({ ...p, sources: p.sources.map((s) => ({ ...s, stats: { ...s.stats } })) }));
}

async function findPlayerById(identifier: string, season: number, teamKey?: string): Promise<Player | null> {
  const keys = teamKey ? [teamKey] : listTeamOptions().map((opt) => opt.value);
  for (const key of keys) {
    const roster = await loadRoster(key, season);
    const match = roster.find((player) => matchPlayerIdentifier(player, identifier));
    if (match) return match;
  }
  return null;
}

export async function GET(request: NextRequest, { params }: Context) {
  const segments = params.segments ?? [];
  if (segments.length === 0) {
    return json(200, { ok: true, ...HELP });
  }

  const [head, ...rest] = segments;
  switch (head) {
    case 'gameday': {
      if (rest[0] === 'next-opponent') {
        const teamKey = request.nextUrl.searchParams.get('teamKey');
        if (!teamKey) {
          return json(400, { ok: false, error: 'teamKey is required' });
        }
        try {
          const data = await getNextOpponent(teamKey);
          if (!data) {
            return json(404, { ok: false, error: 'No upcoming opponent found', teamKey });
          }
          return json(200, { ok: true, data });
        } catch (err: any) {
          return json(502, { ok: false, error: err?.message ?? 'Failed to load schedule' });
        }
      }
      break;
    }
    case 'players': {
      const season = seasonFromRequest(request);
      if (rest.length === 0) {
        const fallbackTeam = listTeamOptions().find((opt) => opt.fangraphsTeamId && opt.baseballSavantTeam)?.value;
        const teamKey = request.nextUrl.searchParams.get('teamKey') ?? fallbackTeam ?? '';
        if (!teamKey) {
          return json(400, { ok: false, error: 'teamKey is required for roster data' });
        }
        try {
          const roster = await loadRoster(teamKey, season);
          if (!roster.length) {
            return json(404, { ok: false, error: 'No roster data available', teamKey, season });
          }
          return json(200, { ok: true, data: roster });
        } catch (err: any) {
          return json(502, { ok: false, error: err?.message ?? 'Failed to load roster' });
        }
      }
      if (rest.length >= 1) {
        const playerId = decodeURIComponent(rest[0]);
        const teamKey = request.nextUrl.searchParams.get('teamKey') ?? undefined;
        try {
          const player = await findPlayerById(playerId, season, teamKey);
          if (!player) {
            return json(404, { ok: false, error: 'Player not found', playerId, season });
          }
          return json(200, { ok: true, data: player });
        } catch (err: any) {
          return json(502, { ok: false, error: err?.message ?? 'Failed to load player' });
        }
      }
      break;
    }
    case 'metrics': {
      if (rest[0] === 'dictionary') {
        return json(200, { ok: true, data: STAT_DICTIONARY });
      }
      break;
    }
    case 'options': {
      if (rest[0] === 'teams') {
        return json(200, { ok: true, data: listTeamOptions() });
      }
      break;
    }
    case 'ping': {
      return json(200, { ok: true, services: ['full-app'], options: listTeamOptions().length });
    }
    default:
      break;
  }

  return json(404, { ok: false, error: 'Unknown endpoint', segments });
}
