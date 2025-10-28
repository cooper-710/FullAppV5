type PlayerIndex = { name: string; mlbam: string }[];
let cache: PlayerIndex | null = null;

export async function resolvePlayerId(name: string): Promise<string | null> {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  if (!cache) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SEQUENCE_API}/players/index`, { cache: "no-store" });
    const data = await res.json();
    cache = (data.players || []) as PlayerIndex;
  }
  const hit = cache!.find(p => p.name.toLowerCase() === n);
  return hit ? hit.mlbam : null;
}
