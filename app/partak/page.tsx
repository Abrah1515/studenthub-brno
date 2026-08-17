import type { Metadata } from "next";
import Link from "next/link";
import { BuddyExplorer } from "@/components/buddy-explorer";
import { PageHeading } from "@/components/page-heading";

export const metadata: Metadata = { title: "Hledám parťáka", description: "Studentské příspěvky pro společné učení, sport, kulturu a výlety v Brně, zveřejněné po ověření e-mailu." };

export default function BuddyPage() {
  return <div className="page-stack"><PageHeading eyebrow="Po ověření e-mailu ihned zveřejněno" title="Hledám parťáka" description="Příspěvek nečeká na předchozí schválení. Komunita jej může nahlásit a opakovaně nahlášený obsah se automaticky skryje ke kontrole. Kontaktní údaje nejsou veřejné." actions={<Link href="/partak/moje" className="button button-secondary">Moje příspěvky</Link>} /><BuddyExplorer /></div>;
}
