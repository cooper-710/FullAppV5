import { useEffect, useState } from 'react';
import type { Player } from '@/lib/entities';
import { fetchPlayers } from '@/lib/api/fullApp';

const rosterCache = new Map<string, Player[]>();
const inflight = new Map<string, Promise<Player[]>>();

export function useRoster(teamKey: string) {
  const [players, setPlayers] = useState<Player[] | null>(() => rosterCache.get(teamKey) ?? null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    if (rosterCache.has(teamKey)) {
      setPlayers(rosterCache.get(teamKey)!);
      setError(null);
      return () => {
        active = false;
      };
    }

    const existing = inflight.get(teamKey);
    const promise = existing ?? fetchPlayers({ teamKey });
    inflight.set(teamKey, promise);

    promise
      .then((data) => {
        if (!active) return;
        rosterCache.set(teamKey, data);
        setPlayers(data);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err : new Error('Failed to load roster'));
      })
      .finally(() => {
        if (inflight.get(teamKey) === promise) {
          inflight.delete(teamKey);
        }
      });

    return () => {
      active = false;
    };
  }, [teamKey]);

  return { players, error };
}
