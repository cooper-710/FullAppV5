import { safeFetchJson } from "./http";
const BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8017";
export async function fetchDeepDive(player: string, seasons: number[]) {
  const qs = new URLSearchParams({ player, seasons: seasons.join(",") }).toString();
  const res = await safeFetchJson(`${BASE}/api/deep-dive?${qs}`);
  return res?.data;
}
