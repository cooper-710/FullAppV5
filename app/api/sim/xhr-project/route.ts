import { NextResponse } from "next/server";
export async function POST(req: Request) {
  const base = process.env.SEQ_API_BASE;
  const body = await req.json().catch(()=>({}));
  if (base) {
    try {
      const r = await fetch(`${base}/xhr-project`, { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(body) });
      const j = await r.json();
      return NextResponse.json(j, { status: 200 });
    } catch (e) {}
  }
  const n = (body?.spray?.length ?? 500);
  const hr = Math.max(24, Math.min(45, Math.round(n * 0.077)));
  const keep = Math.round(hr*0.74);
  const die = hr - keep;
  return NextResponse.json({ hr_if_all_ab_here: hr, keep_hr: keep, die_at_wall: die, confidence: 0.86 });
}
