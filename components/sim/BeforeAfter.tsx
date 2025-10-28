'use client';
export default function BeforeAfter() {
  return (
    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
      <div>
        <h4>Before (BOS 1B Baseline)</h4>
        <div style={{height:120, background:"rgba(255,255,255,0.06)"}}/>
      </div>
      <div>
        <h4>After (With Alonso)</h4>
        <div style={{height:120, background:"rgba(255,255,255,0.12)"}}/>
      </div>
    </div>
  );
}
