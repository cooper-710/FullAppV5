import { NextResponse } from "next/server";
export async function POST(req: Request) {
  const base = process.env.SEQ_API_BASE;
  const body = await req.json().catch(()=>({}));
  if (base) {
    try {
      const r = await fetch(`${base}/cbt`, { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(body) });
      const j = await r.json();
      return NextResponse.json(j, { status: 200 });
    } catch (e) {}
  }
  const { aav=32, start_year=2025 } = body || {};
  const thresholds: Record<number, number> = { 2025: 237, 2026: 251, 2027: 257, 2028: 263 };
  const baseP: Record<number, number> = { 2025: 228, 2026: 241, 2027: 246, 2028: 249 };
  const tiers = Object.entries(thresholds).map(([y,t])=>{
    const year = Number(y);
    const payroll = baseP[year] + (year>=start_year ? aav : 0);
    const tier = payroll > t ? "2" : "1";
    return {year, tier, payroll, threshold: t};
  });
  const headroom = { "2025": +(thresholds[2025] - (baseP[2025]+aav)).toFixed(1), "2026": +(thresholds[2026] - (baseP[2026]+aav)).toFixed(1) };
  return NextResponse.json({ tiers, headroom });
}
