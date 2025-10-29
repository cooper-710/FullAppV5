// lib/mocapMap.ts
// Map our internal roster names to the MoCap app's expected dataset names.
export const MOCAP_NAME_MAP: Record<string, Record<string, string>> = {
  // College example
  'college:wright-state': {
    'Raider Pitcher A': 'Player Name', // maps to the example dataset in your link
  },

  // Pro example (adjust if your MoCap data uses different labels)
  'mlb:NYM': {
    'Tylor Megill': 'Tylor Megill',
  },
};

export function toMocapPlayerName(teamKey: string, internalName?: string) {
  if (!internalName) return 'Player Name';
  const teamMap = MOCAP_NAME_MAP[teamKey];
  return teamMap?.[internalName] ?? internalName;
}
