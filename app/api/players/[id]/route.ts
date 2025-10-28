import { NextResponse } from "next/server";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const seasons = searchParams.get("seasons") || "";
    const id = params.id;
    if (!id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });

    const upstream = await fetch(
      `${process.env.NEXT_PUBLIC_SEQUENCE_API}/players/${encodeURIComponent(id)}?seasons=${encodeURIComponent(seasons)}`,
      { cache: "no-store" }
    );

    const txt = await upstream.text();
    if (!upstream.ok) {
      return NextResponse.json(
        { ok: false, error: `upstream ${upstream.status}`, body: txt.slice(0, 500) },
        { status: upstream.status }
      );
    }

    if (!txt) return NextResponse.json({ ok: true, data: [] });

    try {
      const data = JSON.parse(txt);
      return NextResponse.json({ ok: true, data });
    } catch {
      return NextResponse.json({ ok: false, error: "bad upstream json", body: txt.slice(0, 500) }, { status: 502 });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
