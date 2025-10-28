import create from "zustand";

type Park = "fenway" | "yankee" | "citi";

export type SimState = {
  aav: number;
  years: number;
  slot: 2 | 3 | 4;
  park: Park;
  season: number;
  set: (p: Partial<Omit<SimState, "set">>) => void;
};

export const useSim = create<SimState>((set) => ({
  aav: 32,
  years: 6,
  slot: 3,
  park: "fenway",
  season: 2025,
  set: (p) => set(p),
}));
