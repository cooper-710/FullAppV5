import HeroIntro from "@/components/sim/HeroIntro";
import WarRoom from "@/components/sim/WarRoom";
import ExportActions from "@/components/sim/ExportActions";

export default function Page() {
  return (
    <main style={{padding: 24, display:"grid", gap:24}}>
      <HeroIntro />
      <WarRoom />
      <ExportActions />
    </main>
  );
}
