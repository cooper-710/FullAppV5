import dynamic from "next/dynamic";

const PitcherDeepDivePage = dynamic(
  () => import("@/webapp/src/deep-dive/pitcher/PitcherDeepDivePage"),
  { ssr: false }
);

export default function Page() {
  return <PitcherDeepDivePage />;
}
