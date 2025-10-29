// lib/teamCodes.ts
// Map our internal team keys to the visualizer's expected team codes.
export const TEAM_CODE_BY_KEY: Record<string, string> = {
  'mlb:NYM': 'NYM',
  // add more as needed:
  // 'pro:ari-dbacks': 'ARI',
};

export function pvTeamCode(teamKey: string) {
  return TEAM_CODE_BY_KEY[teamKey] ?? '';
}
