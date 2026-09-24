import type { Metadata } from "next";
import { BuddyExplorer } from "@/components/buddy-explorer";
import { PageHeading } from "@/components/page-heading";
import { OwnerScopeTabs } from "@/components/owner-scope-tabs";
export const metadata: Metadata = { title: "Moji parťáci", robots: { index: false, follow: false } };
export default function MyBuddyPage() { return <div className="page-stack"><PageHeading eyebrow="Soukromý přehled" title="Moje příspěvky a žádosti" description="Tento obsah je dostupný jen ověřenému účtu." /><OwnerScopeTabs mine allHref="/brno/partak" mineHref="/brno/partak/moje" /><BuddyExplorer mine /></div>; }
