export function encodeShare(state: Record<string, any>): string {
  const params = new URLSearchParams();
  Object.entries(state).forEach(([k,v]) => params.set(k, String(v)));
  return params.toString();
}

export function decodeShare(qs: string): Record<string, string> {
  const u = new URLSearchParams(qs);
  const out: Record<string,string> = {};
  u.forEach((v,k) => out[k]=v);
  return out;
}
