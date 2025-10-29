export type Hand = 'R' | 'L' | 'S' | null;
export type PlayerKind = 'pitcher' | 'hitter';

export type PlayerSourceSnapshot = {
  season: number;
  source: 'fangraphs' | 'baseball-savant';
  stats: Record<string, number | string>;
};

export interface Player {
  id: string;
  teamKey: string;
  teamLabel: string;
  level: 'college' | 'pro';
  name: string;
  kind: PlayerKind;
  mlbamId?: number;
  fangraphsId?: number;
  bats?: Hand;
  throws?: Hand;
  position?: string;
  sources: PlayerSourceSnapshot[];
  lastUpdated: string;
}
