export async function safeFetchJson(input: RequestInfo | URL, init?: RequestInit) {
  const res = await fetch(input, { ...init, headers: { ...(init?.headers||{}), Accept: "application/json" } });
  const ct = res.headers.get("content-type") || "";
  const raw = await res.text();
  if (!res.ok) {
    let msg = `HTTP ${res.status} ${res.statusText}`;
    try { const j = JSON.parse(raw); msg = j.detail || j.message || msg; } catch {}
    throw new Error(msg);
  }
  if (!raw) return null;
  if (!ct.toLowerCase().includes("application/json")) throw new Error("Non-JSON response");
  return JSON.parse(raw);
}
