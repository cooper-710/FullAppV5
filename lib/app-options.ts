export type TeamOption = {
  label: string;
  value: string;
  level: 'college' | 'pro';
  mlbTeamId?: number;
  baseballSavantTeam?: string;
  fangraphsTeamId?: number;
};

const TEAM_OPTIONS: TeamOption[] = [
  {
    label: 'New York Mets (MLB)',
    value: 'mlb:NYM',
    level: 'pro',
    mlbTeamId: 121,
    baseballSavantTeam: 'NYM',
    fangraphsTeamId: 25,
  },
  {
    label: 'Wright State Raiders (College)',
    value: 'college:wright-state',
    level: 'college',
  },
];

export const DEFAULT_TEAM_KEY = TEAM_OPTIONS[0]?.value ?? 'mlb:NYM';

export function listTeamOptions(): TeamOption[] {
  return TEAM_OPTIONS.map((opt) => ({ ...opt }));
}

export function getTeamOption(value: string): TeamOption | undefined {
  return TEAM_OPTIONS.find((opt) => opt.value === value);
}

export default TEAM_OPTIONS;
