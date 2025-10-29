'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppState } from '@/lib/state';
import { buildPVUrl, toLastFirst } from '@/lib/pv';
import { pvTeamCode } from '@/lib/teamCodes';
import { useRoster } from '@/lib/hooks/useRoster';

const FALLBACK_TEAM = 'ARI';
const FALLBACK_PITCHER = 'Backhus, Kyle';
const DEFAULT_VIEW = 'catcher' as const; // matches your app
const DEFAULT_TRAIL = 0;
const DEFAULT_ORBIT = 1;

export default function PVEmbed() {
  const { teamKey } = useAppState();
  const { players } = useRoster(teamKey);
  const roster = useMemo(() => (players ?? []).filter((p) => p.kind === 'pitcher'), [players]);
  const firstPitcher = useMemo(() => roster[0]?.name, [roster]);

  const [teamCode, setTeamCode] = useState<string>(FALLBACK_TEAM);
  const [pitcher, setPitcher] = useState<string>(FALLBACK_PITCHER);

  useEffect(() => {
    const code = pvTeamCode(teamKey) || FALLBACK_TEAM;
    setTeamCode(code);
    if (firstPitcher) setPitcher(toLastFirst(firstPitcher));
    else setPitcher(FALLBACK_PITCHER);
  }, [teamKey, roster.length, firstPitcher]);

  const src = useMemo(() => {
    // Always provide a fully-formed URL; your tool can override via its own sidebar.
    const team = teamCode || FALLBACK_TEAM;
    const p = pitcher || FALLBACK_PITCHER;
    return buildPVUrl({
      team,
      pitcher: p,
      view: DEFAULT_VIEW,
      trail: DEFAULT_TRAIL,
      orbit: DEFAULT_ORBIT,
    });
  }, [teamCode, pitcher]);

  return (
    <div className="space-y-4">
      <iframe
        key={src}
        title="3D PitchVisualizer"
        src={src}
        className="w-full h-[72vh] rounded-xl border border-border bg-black"
        allow="fullscreen"
      />
      <div className="flex items-center justify-end">
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="h-9 px-3 rounded-md border border-border bg-surface2 text-sm inline-flex items-center hover:shadow"
        >
          Open in new tab
        </a>
      </div>
    </div>
  );
}
