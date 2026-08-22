import type { Metadata } from "next";
import { CommunityFeed } from "@/components/community-feed";
import { PageHeading } from "@/components/page-heading";
import { getPlaces } from "@/lib/public-data";

export const metadata: Metadata = { title: "Studentská komunita", description: "Otázky, rady, zkušenosti a doporučení studentů v Brně.", alternates: { canonical: "/komunita" }, openGraph: { title: "Studentská komunita · StudentHub Brno", description: "Bezpečný studentský feed pro otázky, rady a zkušenosti napříč brněnskými školami.", url: "/komunita" } };
export const dynamic = "force-dynamic";

export default async function CommunityPage() {
  const places = (await getPlaces("brno")).map((place) => ({ id: place.id, name: place.name, address: place.address }));
  return <div className="page-stack community-page"><PageHeading eyebrow="Otázky, rady a zkušenosti" title="Studentská komunita" description="Veřejná diskuse studentů v Brně. Akce s konkrétním datem patří do Co se děje, domluva společné aktivity do Hledám parťáka." /><CommunityFeed places={places} /></div>;
}
