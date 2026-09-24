import type { Metadata } from "next";
import { BuddyExplorer } from "@/components/buddy-explorer";
import { PageHeading } from "@/components/page-heading";
import { OwnerScopeTabs } from "@/components/owner-scope-tabs";

export const metadata: Metadata = { title: "Hledám parťáka", description: "Studentské příspěvky pro společné učení, sport, kulturu a výlety v Brně, propojené s dobrovolným profilem autora." };

export default function BuddyPage() {
  return <div className="page-stack"><PageHeading eyebrow="S profilem ihned zveřejněno" title="Hledám parťáka" description="Příspěvek nečeká na předchozí schválení. Komunita jej může nahlásit a opakovaně nahlášený obsah se automaticky skryje ke kontrole. Kontaktní údaje nejsou veřejné." /><OwnerScopeTabs mine={false} allHref="/brno/partak" mineHref="/brno/partak/moje" /><BuddyExplorer /></div>;
}
