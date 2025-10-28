export type SprayRow = Record<string, any>;

const DEG = Math.PI/180;

export function getCarryFt(s:SprayRow){
  if (typeof s.carry_ft === 'number') return s.carry_ft;
  if (typeof s.hit_distance_sc === 'number') return s.hit_distance_sc;
  if (typeof s.estimated_distance === 'number') return s.estimated_distance;
  if (typeof s.dist === 'number') return s.dist;
  return null;
}
export function getLaunchDeg(s:SprayRow){
  if (typeof s.launch_angle === 'number') return s.launch_angle;
  if (typeof s.la === 'number') return s.la;
  if (typeof s.launchDeg === 'number') return s.launchDeg;
  return null;
}
export function hasHC(s:SprayRow){
  return typeof s.hc_x === 'number' && typeof s.hc_y === 'number';
}
export function hcToFeet(s:SprayRow){
  const fx = (s.hc_x - 125.42) / 0.72;
  const fy = (198.27 - s.hc_y) / 0.72;
  return { fx, fy };
}

export function estimateApexHeight(s:SprayRow, endDistFt:number){
  const la = getLaunchDeg(s);
  if (la != null){
    const laRad = la*DEG;
    const k = 0.20 + Math.min(0.30, Math.max(0, (la-10)/60))*0.4;
    return Math.max(12, endDistFt * Math.tan(Math.max(0, laRad)) * k);
  }
  const c = getCarryFt(s);
  if (c != null) return Math.max(10, c*0.12);
  return 15;
}

export function makeArcSamples(start:[number,number,number], apex:[number,number,number], end:[number,number,number], steps=40){
  const out = new Float32Array(steps*3);
  for (let i=0;i<steps;i++){
    const t=i/(steps-1);
    const u=1-t;
    const x = u*u*start[0] + 2*u*t*apex[0] + t*t*end[0];
    const y = u*u*start[1] + 2*u*t*apex[1] + t*t*end[1];
    const z = u*u*start[2] + 2*u*t*apex[2] + t*t*end[2];
    out[i*3+0]=x; out[i*3+1]=y; out[i*3+2]=z;
  }
  return out;
}
