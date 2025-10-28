export const runtime = 'nodejs';
import { NextRequest } from 'next/server';

function isJSON(ct: string | null) {
  return !!ct && ct.toLowerCase().includes('application/json');
}
function json(status: number, body: any) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
function norm(s: string) { return s.trim().toLowerCase(); }
function pick<T=any>(o:any, keys:string[]) { for (const k of keys) if (o && o[k]!=null) return o[k] as T; }
function looksLikeSpray(payload:any) {
  const arr = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : null);
  if (!arr || arr.length === 0) return false;
  const keys = Object.keys(arr[0] || {}).map(k => k.toLowerCase());
  const hints = ['spray','spray_deg','carry_ft','apex_ft','is_hr','hang','la'];
  return keys.some(k => hints.some(h => k.includes(h)));
}

async function fetchJSON(u: string) {
  const r = await fetch(u, { headers: { accept:'application/json' } });
  const t = await r.text();
  if (!isJSON(r.headers.get('content-type'))) return { ok:false, status:r.status, url:u, body:t.slice(0,1000) };
  try { return { ok:r.ok, status:r.status, url:u, data: JSON.parse(t) }; }
  catch { return { ok:false, status:r.status, url:u, body:t.slice(0,1000) }; }
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const base = (process.env.BIOLAB_API_BASE || 'http://127.0.0.1:8017/api/biolab').replace(/\/+$/,'');
  const summaryTpl = process.env.DEEP_DIVE_HITTER_SUMMARY_ROUTE || '/hitters/{id}/summary';
  const searchPath = process.env.DEEP_DIVE_HITTER_SEARCH_ROUTE || '/hitters/search';

  const segs = params.path || [];
  if (!(segs.length >= 2 && segs[1] === 'summary')) {
    const passthrough = `${base}/players/${segs.map(encodeURIComponent).join('/')}${req.nextUrl.search || ''}`;
    const r = await fetchJSON(passthrough);
    if (r.ok) return json(r.status, r.data);
    return json(r.status, { error:true, upstream: r.url, body: r.body });
  }

  const name = segs[0];
  const qs = new URLSearchParams(req.nextUrl.searchParams);
  const attempts: any[] = [];

  async function tryURL(u: string) {
    const url = u + (qs.toString() ? `?${qs.toString()}` : '');
    const res = await fetchJSON(url);
    if (res.ok) {
      if (looksLikeSpray(res.data)) { attempts.push({ url: res.url, status: res.status, skip: 'spray' }); return null; }
      return res;
    }
    attempts.push({ url: res.url, status: res.status });
    return null;
  }

  if (summaryTpl.includes('{name}')) {
    const path = summaryTpl.replace('{name}', encodeURIComponent(name));
    const res = await tryURL(`${base}${path}`);
    if (res) return json(res.status, res.data);
  }

  let id: string | undefined;
  if (summaryTpl.includes('{id}')) {
    const searchURL = `${base}${searchPath}?q=${encodeURIComponent(name)}`;
    const s = await fetchJSON(searchURL);
    if (s.ok) {
      const arr = Array.isArray(s.data) ? s.data : (Array.isArray(s.data?.data) ? s.data.data : []);
      const match = arr?.find((x:any) => norm(pick<string>(x, ['full_name','fullName','name']) || '') === norm(name)) || arr?.[0];
      id = pick<string>(match || {}, ['mlbam','mlbam_id','mlb_id','id','player_id']) as string | undefined;
      if (!id && match) id = String(pick<any>(match, ['playerid','playerId','playerID']) || '');
      if (id) {
        const path = summaryTpl.replace('{id}', encodeURIComponent(String(id)));
        const res = await tryURL(`${base}${path}`);
        if (res) return json(res.status, res.data);
      } else {
        attempts.push({ url: searchURL, status: s.status, note: 'no id in search results' });
      }
    } else {
      attempts.push({ url: s.url, status: s.status, body: s.body });
    }
  }

  if (!summaryTpl.includes('{id}') && !summaryTpl.includes('{name}')) {
    const q1 = new URLSearchParams(qs); q1.set('name', name);
    const res1 = await fetchJSON(`${base}${summaryTpl}?${q1.toString()}`);
    if (res1.ok && !looksLikeSpray(res1.data)) return json(res1.status, res1.data);
    attempts.push({ url: res1.url, status: res1.status });

    const q2 = new URLSearchParams(qs); q2.set('player', name);
    const res2 = await fetchJSON(`${base}${summaryTpl}?${q2.toString()}`);
    if (res2.ok && !looksLikeSpray(res2.data)) return json(res2.status, res2.data);
    attempts.push({ url: res2.url, status: res2.status });
  }

  return json(404, { error:true, reason:'no hitter summary route matched', attempts });
}
