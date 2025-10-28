'use client';
import { useMemo } from "react";
import { useSim } from "@/lib/sim/state";
import { projectCBT } from "@/lib/sim/cbt";

export default function PayrollBands() {
  const { aav } = useSim();
  const rows = useMemo(()=>projectCBT(aav, 2025), [aav]);
  return (
    <table style={{width:"100%", borderCollapse:"collapse"}}>
      <thead><tr><th>Year</th><th>Payroll</th><th>Threshold</th><th>Status</th></tr></thead>
      <tbody>
        {rows.map(r=>(
          <tr key={r.year}>
            <td>{r.year}</td>
            <td>${r.payroll}M</td>
            <td>${r.threshold}M</td>
            <td>{r.tier}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
