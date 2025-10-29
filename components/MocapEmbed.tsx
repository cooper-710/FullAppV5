'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppState } from '@/lib/state';
import { buildMocapUrl } from '@/lib/mocap';
import { toMocapPlayerName } from '@/lib/mocapMap';
import { useRoster } from '@/lib/hooks/useRoster';

const FALLBACK_PLAYER = 'Player Name';
const FALLBACK_SESSION = '2025-08-18';
const DEFAULT_LOCK = 1 as const;

export default function MocapEmbed() {
  const { teamKey } = useAppState();
  const { players: roster } = useRoster(teamKey);
  const rosterMemo = useMemo(() => roster ?? [], [roster]);
  const primaryName = useMemo(() => rosterMemo[0]?.name, [rosterMemo]);

  const [player, setPlayer] = useState<string>(FALLBACK_PLAYER);
  const [session, setSession] = useState<string>(FALLBACK_SESSION);

  useEffect(() => {
    const mapped = toMocapPlayerName(teamKey, primaryName);
    setPlayer(mapped || FALLBACK_PLAYER);
    setSession(FALLBACK_SESSION);
  }, [teamKey, primaryName]);

  const src = useMemo(() => {
    const p = player || FALLBACK_PLAYER;
    const s = session || FALLBACK_SESSION;
    return buildMocapUrl({ mode: 'player', player: p, session: s, lock: DEFAULT_LOCK });
  }, [player, session]);

  return (
    <div className="space-y-4">
      <iframe
        key={src}
        title="Motion Capture Viewer"
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
