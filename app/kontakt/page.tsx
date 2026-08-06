import type { Metadata } from "next";
import { Mail, MapPin, Wrench } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { ContactForm } from "@/components/contact-form";
import { brand } from "@/lib/brand";

export const metadata: Metadata = { title: "Kontakt", description: "Kontakt na nezávislý projekt StudentHub Brno.", alternates: { canonical: "/kontakt" } };
export default function ContactPage() { return <div className="page-stack"><PageHeading eyebrow="Ozvěte se" title="Kontakt" description="Náměty, opravy údajů a partnerská spolupráce mají vlastní jasnou cestu." /><section className="contact-grid"><a href={`mailto:${brand.contactEmail}`}><Mail size={22} /><h2>Obecný kontakt</h2><p>{brand.contactEmail}</p><small>Náměty, opravy a zpětná vazba</small></a><a href={`mailto:${brand.partnerEmail}?subject=Partnerská spolupráce`}><MapPin size={22} /><h2>Partneři</h2><p>{brand.partnerEmail}</p><small>Férové nabídky a lokální spolupráce</small></a><a href="/pomoc"><Wrench size={22} /><h2>Technická pomoc</h2><p>Bezpečný neveřejný formulář</p><small>Počítače, sítě a elektronika</small></a></section><ContactForm /></div>; }
