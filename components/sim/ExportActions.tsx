'use client';
import { useSim } from "@/lib/sim/state";
import { encodeShare } from "@/lib/sim/share";

export default function ExportActions() {
  const state = useSim();

  const copy = async () => {
    const qs = encodeShare(state as any);
    const url = `${location.origin}${location.pathname}?${qs}`;
    await navigator.clipboard.writeText(url);
    alert("Share link copied!");
  };

  const pdf = async () => {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);
    const el = document.body;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL("image/png");
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "px",
      format: [el.clientWidth, el.clientHeight],
      compress: true,
    });
    doc.addImage(imgData, "PNG", 0, 0, el.clientWidth, el.clientHeight);
    doc.save("SequenceBioLab_Pete_to_BOS.pdf");
  };

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button onClick={copy}>Copy share link</button>
      <button onClick={pdf}>Export PDF</button>
    </div>
  );
}
