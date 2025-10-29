import { parse } from 'csv-parse/sync';

export type SavantPlayerRow = {
  name: string;
  formattedName: string;
  playerId: number;
  team: string;
  type: 'hitter' | 'pitcher';
  metrics: Record<string, number>;
};

const STATCAST_ENDPOINT = 'https://baseballsavant.mlb.com/leaderboard/statcast';

function buildStatcastUrl(team: string, year: number, type: 'batter' | 'pitcher', minAttempts: number) {
  const params = new URLSearchParams({
    type,
    year: String(year),
    position: '',
    team,
    min: String(minAttempts),
    csv: 'true',
  });
  return `${STATCAST_ENDPOINT}?${params.toString()}`;
}

function coerceNumber(value: unknown): number {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'number') return value;
  const text = String(value).trim();
  if (!text) return NaN;
  const normalized = text.endsWith('%') ? text.slice(0, -1) : text;
  const parsed = Number(normalized.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeSavantName(value: string): { raw: string; display: string } {
  const cleaned = value.trim();
  const parts = cleaned.split(',');
  if (parts.length === 2) {
    const last = parts[0]?.trim();
    const first = parts[1]?.trim();
    if (first && last) {
      return { raw: cleaned, display: `${first} ${last}` };
    }
  }
  return { raw: cleaned, display: cleaned.replace(/\s+/g, ' ') };
}

function pickMetrics(record: Record<string, unknown>): Record<string, number> {
  const metrics: Record<string, number> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === 'last_name, first_name' || key === 'player_id' || key === 'playerid' || key === 'team') {
      continue;
    }
    const numeric = coerceNumber(value);
    if (!Number.isNaN(numeric)) {
      metrics[key] = numeric;
    }
  }
  return metrics;
}

export async function fetchTeamStatcast(
  teamAbbr: string,
  year: number,
  type: 'batter' | 'pitcher',
  minAttempts = 1,
): Promise<SavantPlayerRow[]> {
  const url = buildStatcastUrl(teamAbbr, year, type, minAttempts);
  const res = await fetch(url, { next: { revalidate: 60 * 30 } });
  if (!res.ok) {
    throw new Error(`Baseball Savant request failed (${res.status})`);
  }
  const text = await res.text();
  if (!text.trim()) return [];
  const records = parse(text, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  return records
    .map((record) => {
      const { raw, display } = normalizeSavantName(record['last_name, first_name'] ?? record['player_name'] ?? '');
      const playerId = Number(record.player_id ?? record.playerid ?? record.batter ?? record.pitcher);
      const team = String(record.team ?? '').trim();
      return {
        name: raw,
        formattedName: display,
        playerId: Number.isFinite(playerId) ? playerId : NaN,
        team,
        type: type === 'batter' ? 'hitter' : 'pitcher',
        metrics: pickMetrics(record),
      };
    })
    .filter((row) => row.formattedName.length > 0);
}
