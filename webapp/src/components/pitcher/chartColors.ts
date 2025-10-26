const PALETTE = [
  "#f97316",
  "#22d3ee",
  "#a855f7",
  "#facc15",
  "#34d399",
  "#3b82f6",
  "#fb7185",
  "#8b5cf6",
  "#14b8a6",
  "#ef4444",
];

export function getPitchColor(name: string): string {
  if (!name) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
}

export const CHART_COLORS = PALETTE;
