export const runtime = 'nodejs';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const base = process.env.BIOLAB_API_BASE || 'http://127.0.0.1:8017/api/biolab';
  const upstream = `${base}/players/search${req.nextUrl.search || ''}`;
  const res = await fetch(upstream, { headers: { accept:'application/json' } });
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return new Response(JSON.stringify(data), { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error:true, status: res.status, upstream, body: text.slice(0,1000) }), { status: res.status, headers: { 'content-type': 'application/json' } });
  }
}
