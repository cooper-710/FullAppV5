export type MLBPlayerId = number;

export type OrgLevel = 'college' | 'pro';

export type HitterSeason = {
  playerId: MLBPlayerId;
  season: number;
  teamId?: number;
  stats: {
    PA: number;
    AB: number;
    R: number;
    H: number;
    HR: number;
    RBI: number;
    BB: number;
    SO: number;
    OBP: number;
    SLG: number;
    OPS: number;
  };
};

export type PlayerIdentity = {
  id: MLBPlayerId;
  fullName: string;
  firstLastName?: string;
  primaryNumber?: string;
  primaryPosition?: { code: string; name: string };
  currentTeam?: { id: number; name: string; abbreviation: string };
};

export type MetricDef = {
  key: string;
  label: string;
  entity: 'hitter' | 'pitcher' | 'both';
  unit?: string;
  description: string;
  sourcePreference: string[];
  freshnessSLA: string;
};
