import * as cheerio from 'cheerio';

export type FangraphsCategory = 'bat' | 'pit';

export interface FangraphsRow {
  fangraphsId?: number;
  name: string;
  team: string;
  position?: string;
  stats: Record<string, number | string>;
}

const FG_LEADERBOARD_URL = 'https://www.fangraphs.com/leaders-legacy.aspx';

function buildLeaderboardParams(teamId: number, year: number, category: FangraphsCategory) {
  return new URLSearchParams({
    pos: 'all',
    stats: category,
    lg: 'all',
    qual: '0',
    type: '8',
    season: String(year),
    season1: String(year),
    month: '0',
    ind: '0',
    team: String(teamId),
    rost: '0',
    age: '0',
    filter: '',
    players: '0',
    sort: '20,a',
    page: '1_200',
  });
}

function toNumber(value: string): number | string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const numeric = Number(trimmed.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(numeric) ? numeric : trimmed;
}

function extractFangraphsId(href?: string): number | undefined {
  if (!href) return undefined;
  const match = href.match(/playerid=(\d+)/i);
  if (!match) return undefined;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : undefined;
}

export async function fetchTeamFangraphsLeaderboard(
  teamId: number,
  year: number,
  category: FangraphsCategory,
): Promise<FangraphsRow[]> {
  const params = buildLeaderboardParams(teamId, year, category);
  const url = `${FG_LEADERBOARD_URL}?${params.toString()}`;
  const res = await fetch(url, { next: { revalidate: 60 * 30 } });
  if (!res.ok) {
    throw new Error(`FanGraphs request failed (${res.status})`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const table = $('table.rgMasterTable');
  if (!table.length) return [];
  const headerCells = table.find('thead tr').last().find('th').slice(1);
  const headers = headerCells
    .map((_, el) => $(el).text().trim() || `col${_}`)
    .get();
  const rows: FangraphsRow[] = [];
  table.find('tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (!cells.length) return;
    const nameCell = cells.eq(1);
    const nameText = nameCell.text().trim();
    if (!nameText || /Team Totals/i.test(nameText)) {
      return;
    }
    const link = nameCell.find('a').attr('href');
    const fangraphsId = extractFangraphsId(link);
    const stats: Record<string, number | string> = {};
    cells.each((idx, cell) => {
      if (idx === 0) return; // skip rank
      const header = headers[idx - 1] ?? `col${idx}`;
      const valueText = $(cell).text().trim();
      stats[header] = toNumber(valueText);
    });
    const team = String(stats.Team ?? stats.Tm ?? '').trim();
    const position = typeof stats.Pos === 'string' ? stats.Pos : undefined;
    rows.push({
      fangraphsId,
      name: nameText,
      team,
      position,
      stats,
    });
  });
  return rows;
}
