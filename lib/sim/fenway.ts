export type SprayPoint = { px:number; pz:number; ev:number; la:number; is_hr:boolean };

export async function xhrProject(park: string, spray: SprayPoint[]) {
  try {
    const r = await fetch("/api/sim/xhr-project", {method:"POST", body: JSON.stringify({park, spray})});
    return await r.json();
  } catch (e) {
    // fallback mock
    const hr_if_all_ab_here = Math.max(24, Math.min(45, Math.round(spray.length * 0.075)));
    return { hr_if_all_ab_here, keep_hr: Math.round(hr_if_all_ab_here*0.75), die_at_wall: Math.round(hr_if_all_ab_here*0.25), confidence: 0.82 };
  }
}
