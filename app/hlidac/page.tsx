import type { Metadata } from "next";
import { PageHeading } from "@/components/page-heading";
import { WatcherCenter } from "@/components/watcher-center";

export const metadata: Metadata = { title: "Hlídač termínů a akcí", description: "Oblíbené termíny, připomínky a upozornění na důležité změny pro studenty v Brně.", alternates: { canonical: "/hlidac" }, robots: { index: false, follow: false } };
export default function WatcherPage() { return <div className="page-stack"><PageHeading eyebrow="Bez registrace na tomto zařízení" title="Hlídač" description="Uložte si termíny a akce, nastavte připomínku a mějte důležité školní změny na jednom místě." /><WatcherCenter /></div>; }
