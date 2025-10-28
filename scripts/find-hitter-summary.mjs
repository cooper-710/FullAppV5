import fs from 'fs';
import path from 'path';

const name = process.argv[2] || 'Pete Alonso';
const season = process.argv[3] || '2024';
const apiBaseEnv = (process.env.BIOLAB_API_BASE || 'http://127.0.0.1:8017/api/biolab').replace(/\/+$/,'');
const origin = apiBaseEnv.replace(/\/api\/biolab.*$/,'');
const envPath = path.join(process.cwd(), '.env.local');

async function getJSON(u){
  try{
    const r = await fetch(u, { headers:{ accept:'application/json' } });
    const t = await r.text();
    const isJ = (r.headers.get('content-type')||'').toLowerCase().includes('application/json');
    return { ok:r.ok, isJ, status:r.status, url:u, data: isJ ? JSON.parse(t) : t };
  } catch(e){ return { ok:false, isJ:false, status:0, url:u, data:String(e) }; }
}

async function findSpec(){
  const tries = [`${apiBaseEnv}/openapi.json`, `${origin}/openapi.json`, `${origin}/docs/openapi.json`];
  for(const u of tries){
    const r = await getJSON(u);
    if(r.ok && r.isJ && r.data?.paths) return r.data;
  }
  return null;
}

function looksLikeSpray(payload){
  const arr = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : null);
  if(!arr || arr.length===0) return false;
  const ks = Object.keys(arr[0]||{}).map(k=>k.toLowerCase());
  const hints = ['spray','spray_deg','carry_ft','apex_ft','is_hr','hang','la'];
  return ks.some(k=>hints.some(h=>k.includes(h)));
}
function looksLikeSummary(payload){
  const obj = Array.isArray(payload) ? payload[0] : (Array.isArray(payload?.data) ? payload.data[0] : payload);
  if(!obj) return false;
  const ks = Object.keys(obj).map(k=>k.toLowerCase());
  const sig = ['wrc','xwoba','xslg','bb%','k%','pa','avg_ev','hard','barrel'];
  return sig.some(s=>ks.some(k=>k.includes(s)));
}

function stripBase(p){ return p.replace(/^\/api\/biolab/,''); }
function pathTemplateToEnvRoute(p){ return stripBase(p).replace(/\{[^}]+\}/,'{id}'); }

async function resolveSearch(nameStr, paths){
  const all = Object.keys(paths||{});
  const searchCand = all.filter(p => /search/i.test(p) && /(hitt|player)/i.test(p));
  for(const p of searchCand){
    const u1 = `${origin}${p}?q=${encodeURIComponent(nameStr)}`;
    const u2 = `${origin}${p}?name=${encodeURIComponent(nameStr)}`;
    const u3 = `${origin}${p}?player=${encodeURIComponent(nameStr)}`;
    for(const u of [u1,u2,u3]){
      const r = await getJSON(u);
      if(r.ok && r.isJ){
        const arr = Array.isArray(r.data) ? r.data : (Array.isArray(r.data?.data) ? r.data.data : []);
        const first = arr && arr[0];
        if(first){
          const id = first.mlbam || first.mlbam_id || first.mlb_id || first.player_id || first.id || first.playerid || first.playerId || first.playerID;
          if(id) return { searchPath:p, id:String(id) };
        }
      }
    }
  }
  return { searchPath: null, id: null };
}

async function trySummaryCandidates(nameStr, seasonStr, paths, resolvedId){
  const all = Object.keys(paths||{});
  const sumCand = all.filter(p => /summary/i.test(p) && /(hitt|player)/i.test(p));
  for(const p of sumCand){
    const op = (paths[p].get||paths[p].GET||paths[p].Get);
    const params = Array.isArray(op?.parameters) ? op.parameters : [];
    const qp = new URLSearchParams();
    const qnames = params.filter(x=>x.in==='query').map(x=>x.name);
    if(qnames.includes('seasons')) qp.set('seasons', seasonStr);
    if(qnames.includes('season')) qp.set('season', seasonStr);
    if(qnames.includes('year')) qp.set('year', seasonStr);
    if(qnames.some(n=>/name/i.test(n))) qp.set(qnames.find(n=>/name/i.test(n)), nameStr);
    if(qnames.some(n=>/player/i.test(n))) qp.set(qnames.find(n=>/player/i.test(n)), nameStr);
    let filled = p;
    if(/\{[^}]*id[^}]*\}/i.test(p) && resolvedId) filled = p.replace(/\{[^}]*id[^}]*\}/i, encodeURIComponent(resolvedId));
    else if(/\{[^}]*mlbam[^}]*\}/i.test(p) && resolvedId) filled = p.replace(/\{[^}]*mlbam[^}]*\}/i, encodeURIComponent(resolvedId));
    else if(/\{[^}]*name[^}]*\}/i.test(p)) filled = p.replace(/\{[^}]*name[^}]*\}/i, encodeURIComponent(nameStr));
    const url = `${origin}${filled}${qp.toString()?`?${qp.toString()}`:''}`;
    const r = await getJSON(url);
    if(r.ok && r.isJ && !looksLikeSpray(r.data) && looksLikeSummary(r.data)){
      return { summaryPathTemplate: p };
    }
  }
  return { summaryPathTemplate: null };
}

function upsertEnv(k,v, text){
  const re = new RegExp('^'+k+'=.*$','m');
  if(re.test(text)) return text.replace(re, k+'='+v);
  return (text.endsWith('\n')?text:text+'\n') + k+'='+v+'\n';
}

async function main(){
  const spec = await findSpec();
  if(!spec){ console.log('ERROR: openapi not found'); process.exit(2); }
  const { searchPath, id } = await resolveSearch(name, spec.paths);
  const { summaryPathTemplate } = await trySummaryCandidates(name, season, spec.paths, id);
  if(!summaryPathTemplate){
    console.log(JSON.stringify({ error:true, msg:'no summary match', tried:true }, null, 2));
    process.exit(1);
  }
  let envText = '';
  try{ envText = fs.readFileSync(envPath,'utf-8'); }catch(e){ envText=''; }
  envText = upsertEnv('DEEP_DIVE_HITTER_SUMMARY_ROUTE', pathTemplateToEnvRoute(summaryPathTemplate), envText);
  envText = upsertEnv('DEEP_DIVE_HITTER_SEARCH_ROUTE', stripBase(searchPath || '/hitters/search'), envText);
  fs.writeFileSync(envPath, envText);
  console.log('OK', pathTemplateToEnvRoute(summaryPathTemplate), stripBase(searchPath || '/hitters/search'));
}
await main();
