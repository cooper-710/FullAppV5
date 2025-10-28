'use client';
import { useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Instances, Instance, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useSim } from '@/lib/sim/state';
import { hasHC, hcToFeet, getCarryFt, estimateApexHeight, makeArcSamples } from '@/lib/sim/physics';

type Spray = Record<string,any>;

const SCALE_HC = 1.5;
const FLIP_HC_X = false;
const FLIP_HC_Y = false;

function FitCam({fitKey,points}:{fitKey:number;points:THREE.Vector3[];}){
  const { camera } = useThree();
  useEffect(()=>{
    if(!points.length) return;
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(const p of points){ if(p.x<minX)minX=p.x; if(p.x>maxX)maxX=p.x; if(p.z<minZ)minZ=p.z; if(p.z>maxZ)maxZ=p.z; }
    const cx=(minX+maxX)/2, cz=(minZ+maxZ)/2;
    const span=Math.max(maxX-minX,maxZ-minZ)||1;
    camera.position.set(cx, Math.max(120, span*0.7), cz + Math.max(200, span*1.1));
    camera.lookAt(cx,0,cz);
  },[fitKey,points,camera]);
  return <OrbitControls enablePan enableDamping minDistance={80} maxDistance={1400} />;
}

export default function FenwayTranslator3D(){
  const { season } = useSim();
  const [endKept,setEndKept] = useState<THREE.Vector3[]>([]);
  const [endOther,setEndOther] = useState<THREE.Vector3[]>([]);
  const [flights,setFlights] = useState<{verts:Float32Array,color:string}[]>([]);
  const [fitKey,setFitKey] = useState(0);
  const [showFlights,setShowFlights] = useState(true);
  const [showEndpoints,setShowEndpoints] = useState(true);

  useEffect(()=>{
    let ok=true;
    (async()=>{
      const r=await fetch(`/api/spray?player=pete-alonso&year=${season}`,{cache:'no-store'});
      const j=await r.json();
      const arr:Spray[] = Array.isArray(j?.spray)? j.spray : [];
      const kept:THREE.Vector3[]=[]; const oth:THREE.Vector3[]=[];
      const lines:{verts:Float32Array,color:string}[]=[];
      for(const s of arr){
        if(!hasHC(s)) continue;
        const { fx, fy } = hcToFeet(s);
        const ex = (FLIP_HC_X ? -fx : fx) * SCALE_HC;
        const ez = (FLIP_HC_Y ? -fy : fy) * SCALE_HC;
        const end = new THREE.Vector3(ex, 0.2, ez);
        const wasHR = !!s.is_hr || s.event === 'home_run' || s.bb_type === 'hr';

        if (showEndpoints){
          if (wasHR) kept.push(end); else oth.push(end);
        }

        if (showFlights){
          const start:[number,number,number] = [0,3.0,0];
          const dist2D = Math.hypot(ex-0, ez-0) / Math.max(1, SCALE_HC);
          const hApex = estimateApexHeight(s, dist2D);
          const midX = ex*0.55, midZ = ez*0.55;
          const apex:[number,number,number] = [midX, hApex, midZ];
          const verts = makeArcSamples(start, apex, [ex, 0.2, ez], 48);
          lines.push({verts, color: wasHR ? '#20c997' : '#ced4da'});
        }
      }
      if(!ok) return;
      setEndKept(kept); setEndOther(oth); setFlights(lines); setFitKey(v=>v+1);
      console.log('Rendered:', arr.length, 'Endpoints:', kept.length+oth.length, 'Flights:', lines.length);
    })();
    return()=>{ok=false};
  },[season,showFlights,showEndpoints]);

  const forFit = useMemo(()=>[...endKept,...endOther], [endKept,endOther]);

  return (
    <div style={{height:560,borderRadius:12,position:'relative',overflow:'hidden',background:'transparent'}}>
      <div style={{position:'absolute',top:10,right:10,zIndex:2,display:'flex',gap:8}}>
        <label style={{display:'flex',alignItems:'center',gap:6}}><input type="checkbox" checked={showFlights} onChange={e=>setShowFlights(e.target.checked)}/>Flights</label>
        <label style={{display:'flex',alignItems:'center',gap:6}}><input type="checkbox" checked={showEndpoints} onChange={e=>setShowEndpoints(e.target.checked)}/>Endpoints</label>
        <button onClick={()=>setFitKey(v=>v+1)} style={{padding:'6px 10px',borderRadius:8}}>Reset</button>
      </div>

      <Canvas camera={{position:[0,130,220],fov:52}}>
        <ambientLight intensity={0.95}/>
        <directionalLight position={[180,240,160]} intensity={0.95}/>
        {showFlights && flights.map((f,i)=>(
          <Line key={i} points={float32ToVec3(f.verts)} color={f.color} lineWidth={1.5} />
        ))}
        {showEndpoints && (
          <Instances limit={40000}>
            <sphereGeometry args={[1.3,10,10]} />
            <meshStandardMaterial />
            {endKept.map((p,i)=>(<Instance key={'k'+i} position={[p.x,p.y,p.z]} color="#20c997"/>))}
            {endOther.map((p,i)=>(<Instance key={'o'+i} position={[p.x,p.y,p.z]} color="#ced4da"/>))}
          </Instances>
        )}
        <FitCam fitKey={fitKey} points={forFit}/>
        <gridHelper args={[1200, 60]} position={[0,-0.01,0]} />
      </Canvas>
    </div>
  );
}

function float32ToVec3(buf:Float32Array){
  const out: [number,number,number][] = [];
  for (let i=0;i<buf.length;i+=3){
    out.push([buf[i],buf[i+1],buf[i+2]]);
  }
  return out;
}
