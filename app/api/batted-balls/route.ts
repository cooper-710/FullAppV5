import { NextRequest, NextResponse } from 'next/server';

const API = process.env.SEC_API_BASE || 'http://127.0.0.1:8017';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const player = url.searchParams.get('player') || '';
  const season = url.searchParams.get('season') || '';

  const res = await fetch(`${API}/batted-balls?player=${encodeURIComponent(player)}&season=${encodeURIComponent(season)}`, { cache: 'no-store' });
  const data = await res.json();
  const arr = Array.isArray(data) ? data : (data.batted_balls ?? data.data ?? []);
  return NextResponse.json(arr);
}
