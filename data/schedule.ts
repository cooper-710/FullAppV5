import { getTeamOption } from '@/lib/app-options';
import type { OrgLevel } from '@/lib/types';

export type NextOpponent = {
  teamName: string;
  opponentName: string;
  gameTimeLocal: string;
  probablePitchers?: { home?: string; away?: string };
  level: OrgLevel;
  source?: string;
};

const MLB_SCHEDULE_URL = 'https://statsapi.mlb.com/api/v1/schedule';

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function inferOpponentName(game: any, isHome: boolean): string {
  const side = isHome ? game.teams.away : game.teams.home;
  return side?.team?.name ?? 'TBD';
}

function extractProbablePitcher(game: any, side: 'home' | 'away'): string | undefined {
  const pitcher = game?.probablePitchers?.[side];
  if (!pitcher) return undefined;
  return pitcher.fullName ?? pitcher.lastFirstName ?? pitcher.firstLastName ?? undefined;
}

export async function getNextOpponent(teamKey: string, daysAhead = 14): Promise<NextOpponent | null> {
  const option = getTeamOption(teamKey);
  if (!option?.mlbTeamId) {
    return null;
  }
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + Math.max(daysAhead, 1));
  const params = new URLSearchParams({
    sportId: '1',
    teamId: String(option.mlbTeamId),
    startDate: formatDate(today),
    endDate: formatDate(end),
  });
  const res = await fetch(`${MLB_SCHEDULE_URL}?${params.toString()}`, { next: { revalidate: 300 } });
  if (!res.ok) {
    throw new Error(`Failed to load schedule (${res.status})`);
  }
  const data = await res.json();
  const dates: any[] = Array.isArray(data?.dates) ? data.dates : [];
  for (const date of dates) {
    for (const game of date?.games ?? []) {
      const teams = game?.teams;
      if (!teams) continue;
      const isHome = teams.home?.team?.id === option.mlbTeamId;
      const isAway = teams.away?.team?.id === option.mlbTeamId;
      if (!isHome && !isAway) continue;
      const opponentName = inferOpponentName(game, isHome);
      const probablePitchers = {
        home: extractProbablePitcher(game, 'home'),
        away: extractProbablePitcher(game, 'away'),
      };
      return {
        teamName: option.label,
        opponentName,
        gameTimeLocal: game?.gameDate ?? new Date(date.date).toISOString(),
        probablePitchers,
        level: option.level,
        source: 'mlb-statsapi',
      } satisfies NextOpponent;
    }
  }
  return null;
}
