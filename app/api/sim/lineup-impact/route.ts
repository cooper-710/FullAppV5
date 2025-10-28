import { NextResponse } from "next/server";
export async function POST(req: Request) {
  const base = process.env.SEQ_API_BASE;
  const body = await req.json().catch(()=>({}));
  if (base) {
    try {
      const r = await fetch(`${base}/lineup-impact`, { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(body) });
      const j = await r.json();
      return NextResponse.json(j, { status: 200 });
    } catch (e) {}
  }
  const slot = body?.slot ?? 3;
  const slotBoost = {2:0.18,3:0.22,4:0.15}[slot as 2|3|4] || 0.2;
  const rpg = +slotBoost.toFixed(2);
  const wrc = Math.round(rpg*40);
  const war = +(rpg*9.5).toFixed(1);
  return NextResponse.json({ team_wrc_plus_delta: wrc, runs_per_game_delta: rpg, war_delta: war });
}
