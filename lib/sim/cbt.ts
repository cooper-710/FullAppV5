export function projectCBT(aav:number, startYear:number) {
  const thresholds: Record<number, number> = {
    2025: 237, 2026: 251, 2027: 257, 2028: 263
  };
  const bosBasePayroll: Record<number, number> = {
    2025: 228, 2026: 241, 2027: 246, 2028: 249
  };
  const out = Object.entries(thresholds).map(([y,t])=>{
    const year = Number(y);
    const payroll = bosBasePayroll[year] + (year>=startYear ? aav : 0);
    const tier = payroll > t ? "Above" : "Below";
    return {year, threshold: t, payroll, tier, headroom: +(t - payroll).toFixed(1)};
  });
  return out;
}
