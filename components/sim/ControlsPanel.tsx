'use client';
import { useSim } from "@/lib/sim/state";

export default function ControlsPanel() {
  const { aav, years, slot, park, set } = useSim();
  return (
    <div style={{display:"grid", gap:12, gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))"}}>
      <label>AAV: ${aav}M
        <input type="range" min={20} max={45} value={aav} onChange={e=>set({aav: Number(e.target.value)})}/>
      </label>
      <label>Years: {years}
        <input type="range" min={3} max={8} value={years} onChange={e=>set({years: Number(e.target.value)})}/>
      </label>
      <label>Batting Slot: {slot}
        <input type="range" min={2} max={4} value={slot} onChange={e=>set({slot: Number(e.target.value) as 2|3|4})}/>
      </label>
      <label>Park:
        <select value={park} onChange={e=>set({park: e.target.value as any})}>
          <option value="fenway">Fenway</option>
          <option value="yankee">Yankee</option>
          <option value="citi">Citi</option>
        </select>
      </label>
    </div>
  );
}
