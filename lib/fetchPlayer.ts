import { resolvePlayerId } from "./resolvePlayerId";
import { getJSON } from "./http";

export async function fetchPlayer(name: string, years: number[]) {
  const id = await resolvePlayerId(name);
  if (!id) throw new Error(`Unknown player: ${name}`);
  const url = `/api/players/${encodeURIComponent(id)}?seasons=${years.join(",")}`;
  const res = await fetch(url, { cache: "no-store" });
  return getJSON(res);
}
