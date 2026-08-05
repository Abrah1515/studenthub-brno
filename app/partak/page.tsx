import type { Metadata } from "next";
import Link from "next/link";
import { BuddyExplorer } from "@/components/buddy-explorer";
import { PageHeading } from "@/components/page-heading";
export const metadata: Metadata = { title: "Hledám parťáka", description: "Moderované studentské příspěvky pro společné učení, sport, kulturu a výlety v Brně." };
export default function BuddyPage() { return <div className="page-stack"><PageHeading eyebrow="Ověřené účty · moderovaný obsah" title="Hledám parťáka" description="Najděte někoho na pivo, kino, sport, kulturu, učení nebo výlet. Kontaktní údaje nejsou veřejné." actions={<Link href="/partak/moje" className="button button-secondary">Moje příspěvky</Link>} /><BuddyExplorer /></div>; }
