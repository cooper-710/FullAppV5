export const runtime = 'nodejs';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const base = process.env.BIOLAB_API_BASE || 'http://127.0.0.1:8017/api/biolab';
  const qs = req.nextUrl.search ? req.nextUrl.search : '';
  const url = `${base}/hitters/${params.path.map(encodeURIComponent).join('/')}${qs}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await res.text();
  const ct = res.headers.get('content-type');
  if (ct && ct.toLowerCase().includes('application/json'))
    return new Response(text, { status: res.status, headers: { 'content-type': 'application/json' } });
  return new Response(JSON.stringify({ error:true, upstream:url, status:res.status, body:text.slice(0,1000) }), { status: res.status, headers: { 'content-type': 'application/json' } });
}
