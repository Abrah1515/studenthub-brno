import type { Metadata } from "next";
import Link from "next/link";
import { HelpRequestsExplorer } from "@/components/help-requests-explorer";
import { PageHeading } from "@/components/page-heading";

export const metadata: Metadata = { title: "Moje žádosti o pomoc", robots: { index: false, follow: false } };
export default function MyHelpRequestsPage() { return <div className="page-stack"><PageHeading eyebrow="Soukromý přehled tohoto zařízení" title="Moje žádosti" description="Vlastnictví je chráněné technickou cookie. Kontaktní údaje se v tomto přehledu ani ve veřejné části neposílají." actions={<Link className="button button-secondary" href="/pomoc">Nová žádost</Link>} /><HelpRequestsExplorer mine /></div>; }
