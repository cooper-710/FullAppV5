'use client';
import { useEffect, useState } from 'react';
import { useAppState } from '@/lib/state';
import { fetchNextOpponent } from '@/lib/api/fullApp';

type NextOpp = Awaited<ReturnType<typeof fetchNextOpponent>> | null;

export function GameDayClient() {
  const { teamKey } = useAppState();
  const [next, setNext] = useState<NextOpp>(null);

  useEffect(() => {
    let live = true;
    const ctrl = new AbortController();
    fetchNextOpponent(teamKey, ctrl.signal)
      .then((d) => {
        if (live) setNext(d);
      })
      .catch((err) => {
        if (!live) return;
        console.warn('Failed to load next opponent', err);
        setNext(null);
      });
    return () => {
      live = false;
      ctrl.abort();
    };
  }, [teamKey]);

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <section className="card p-5">
        <h3 className="font-semibold mb-2">Team Snapshot</h3>
        {next ? (
          <p className="text-sm text-muted">
            {next.teamName} vs <span className="font-medium text-text">{next.opponentName}</span>
            <br />
            First pitch: {new Date(next.gameTimeLocal).toLocaleString()}
            {next.source && (
              <>
                <br />
                Source: {next.source}
              </>
            )}
          </p>
        ) : (
          <p className="text-sm text-muted">No upcoming game found.</p>
        )}
      </section>
      <section className="card p-5">
        <h3 className="font-semibold mb-2">Likely Starters</h3>
        {next?.probablePitchers ? (
          <p className="text-sm text-muted">
            Home: {next.probablePitchers.home ?? 'TBD'} · Away: {next.probablePitchers.away ?? 'TBD'}
          </p>
        ) : (
          <p className="text-sm text-muted">TBD</p>
        )}
      </section>
      <section className="card p-5">
        <h3 className="font-semibold mb-2">Pre-Game Pack</h3>
        <p className="text-sm text-muted">Auto-assembled tiles + Sequence PDF cards (coming soon).</p>
      </section>
    </div>
  );
}
