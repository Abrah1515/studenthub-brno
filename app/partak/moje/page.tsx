import type { Metadata } from "next";
import Link from "next/link";
import { BuddyExplorer } from "@/components/buddy-explorer";
import { PageHeading } from "@/components/page-heading";
export const metadata: Metadata = { title: "Moji parťáci", robots: { index: false, follow: false } };
export default function MyBuddyPage() { return <div className="page-stack"><PageHeading eyebrow="Soukromý přehled" title="Moje příspěvky a žádosti" description="Tento obsah je dostupný jen ověřenému účtu." actions={<Link href="/partak" className="button button-secondary">Veřejné příspěvky</Link>} /><BuddyExplorer mine /></div>; }
