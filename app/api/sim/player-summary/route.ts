import { NextResponse } from "next/server";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const year = url.searchParams.get("year") || "2025";
  const base = process.env.SEQ_API_BASE;
  if (base) {
    try {
      const r = await fetch(`${base}/player-summary?year=${year}`);
      const j = await r.json();
      return NextResponse.json(j, { status: 200 });
    } catch (e) {}
  }
  const mock = {
    player: "Pete Alonso",
    hand: "R",
    age: 30,
    bip: 509,
    spray: Array.from({length: 509}).map(()=>({
      px:(Math.random()*110-55), pz:(Math.random()*50),
      ev:85+Math.random()*30, la:5+Math.random()*35, is_hr:Math.random()<0.08
    })),
    rates:{ wrc_plus:144, hr:40, bb_pct:9.0, k_pct:23.0 },
    year: Number(year)
  };
  return NextResponse.json(mock, { status: 200 });
}
