export type KPI = {
  team_wrc_plus_delta: number;
  runs_per_game_delta: number;
  war_delta: number;
  xhr_season: number;
  xhr_career: number;
  cbt_tier_2025: string;
};

export function synthesizeKPI(input: {
  slot: 2|3|4; aav: number; years: number;
  xhr:{season:number; career:number};
}): KPI {
  const slotBoost = {2: 0.18, 3: 0.22, 4: 0.15}[input.slot];
  const runs_per_game_delta = +(slotBoost).toFixed(2);
  const team_wrc_plus_delta = Math.round(runs_per_game_delta * 40);
  const war_delta = +(runs_per_game_delta * 9.5).toFixed(1);
  const cbt_tier_2025 = input.aav >= 34 ? "Tier 2" : "Tier 1";
  return {
    team_wrc_plus_delta,
    runs_per_game_delta,
    war_delta,
    xhr_season: input.xhr.season,
    xhr_career: input.xhr.career,
    cbt_tier_2025
  };
}
