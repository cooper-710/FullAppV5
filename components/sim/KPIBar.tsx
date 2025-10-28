'use client';
import { useEffect, useState } from "react";
import { useSim } from "@/lib/sim/state";
import { xhrProject } from "@/lib/sim/fenway";

export default function KPIBar() {
  const { aav, years, slot, park, season } = useSim();
  const [spray, setSpray] = useState<any[]>([]);
  const [xhr, setXhr] = useState<{season:number, career:number}>({season: 39, career: 232});

  useEffect(() => {
    let ok = true;
    (async () => {
      const r = await fetch(`/api/sim/player-summary?year=${season}`);
      const j = await r.json();
      if (!ok) return;
      setSpray(j.spray || []);
      const res = await xhrProject(park, j.spray || []);
      setXhr({ season: res.hr_if_all_ab_here ?? 39, career: 232 });
    })();
    return () => { ok = false; };
  }, [park, season]);

  const slotBoost = {2: 0.18, 3: 0.22, 4: 0.15}[slot as 2|3|4] || 0.2;
  const runs_per_game_delta = +slotBoost.toFixed(2);
  const team_wrc_plus_delta = Math.round(runs_per_game_delta * 40);
  const war_delta = +(runs_per_game_delta * 9.5).toFixed(1);
  const cbt_tier_2025 = aav >= 34 ? "Tier 2" : "Tier 1";

  const chip = (label:string, val:string|number)=> (
    <div style={{padding:"8px 12px", borderRadius:8, background:"rgba(255,255,255,0.06)"}}>
      <div style={{opacity:0.7, fontSize:12}}>{label}</div>
      <div style={{fontWeight:700, fontSize:18}}>{val}</div>
    </div>
  );

  return (
    <div style={{display:"flex", gap:12, flexWrap:"wrap"}}>
      {chip("Team wRC+ Δ", team_wrc_plus_delta)}
      {chip("R/G Δ", runs_per_game_delta)}
      {chip("WAR Δ", war_delta)}
      {chip("xHR @ Fenway (Szn)", xhr.season)}
      {chip("xHR @ Fenway (Career)", xhr.career)}
      {chip("CBT 2025", cbt_tier_2025)}
    </div>
  );
}
