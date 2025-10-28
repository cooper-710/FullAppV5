import { NextRequest, NextResponse } from 'next/server';

const API = process.env.SEC_API_BASE || 'http://127.0.0.1:8017';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const player = url.searchParams.get('player') || '';
  const year = url.searchParams.get('year') || '';
  const park = url.searchParams.get('park') || 'fenway';

  const res = await fetch(`${API}/spray?player=${encodeURIComponent(player)}&year=${encodeURIComponent(year)}&park=${encodeURIComponent(park)}`, { cache: 'no-store' });
  const data = await res.json();
  const arr = Array.isArray(data) ? data : (data.spray ?? data.data ?? []);
  return NextResponse.json(arr);
}
