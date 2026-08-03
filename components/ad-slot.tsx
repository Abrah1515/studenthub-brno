import { Megaphone } from "lucide-react";

export function AdSlot({ label = "Partner semestru" }: { label?: string }) {
  if (process.env.NEXT_PUBLIC_ADS_ENABLED !== "true") return null;
  return <aside className="ad-slot" aria-label="Reklamní prostor"><Megaphone size={19} aria-hidden="true" /><div><small>REKLAMNÍ POZICE</small><p>{label} — prostor mimo ovládací prvky</p></div></aside>;
}
