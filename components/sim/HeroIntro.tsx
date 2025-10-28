'use client';
import { motion } from "framer-motion";

export default function HeroIntro() {
  return (
    <div style={{height: "30vh", display:"grid", placeItems:"center"}}>
      <motion.div initial={{opacity:0, y:12}} animate={{opacity:1, y:0}} transition={{duration:0.4}} style={{textAlign:"center"}}>
        <h1 style={{fontSize:44}}>Pete Alonso → Boston</h1>
        <p style={{opacity:0.75}}>Cinematic Simulation • SequenceBioLab</p>
      </motion.div>
    </div>
  );
}
