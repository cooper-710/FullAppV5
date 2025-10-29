'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import TEAM_OPTIONS, { DEFAULT_TEAM_KEY, TeamOption } from '@/lib/app-options';

type AppState = { teamKey: string; setTeamKey: (k: string) => void; options: TeamOption[] };

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [teamKey, setTeamKey] = useState<string>(DEFAULT_TEAM_KEY);

  useEffect(() => {
    const k = window.localStorage.getItem('sbl.teamKey');
    if (k) setTeamKey(k);
  }, []);
  useEffect(() => {
    window.localStorage.setItem('sbl.teamKey', teamKey);
  }, [teamKey]);

  const value = useMemo(() => ({ teamKey, setTeamKey, options: TEAM_OPTIONS }), [teamKey]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppStateProvider missing');
  return v;
}
