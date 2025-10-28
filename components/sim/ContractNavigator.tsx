'use client';
import { useSim } from "@/lib/sim/state";

export default function ContractNavigator() {
  const { set } = useSim();
  return (
    <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
      <button onClick={()=>set({aav: 36, years: 8})}>Aggressive 8y</button>
      <button onClick={()=>set({aav: 32, years: 6})}>Balanced 6y</button>
      <button onClick={()=>set({aav: 24, years: 3})}>Bridge 3y</button>
    </div>
  );
}
