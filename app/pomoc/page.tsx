import type { Metadata } from "next";
import { Check, Clock3, LockKeyhole } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { ServiceRequestForm } from "@/components/service-request-form";

export const metadata: Metadata = { title: "Technická pomoc", description: "Neveřejná poptávka pomoci s počítačem, notebookem, sítí, zálohou nebo výběrem zařízení.", alternates: { canonical: "/pomoc" } };
export default function HelpPage() { return <div className="page-stack"><PageHeading eyebrow="Lidská pomoc, bez call-centra" title="Technická pomoc" description="Pošlete nezávaznou poptávku. Citlivé údaje se nezobrazí veřejně." /><section className="help-layout"><aside className="help-aside"><h2>Jak to funguje</h2><ol><li><span>1</span><div><strong>Popíšete problém</strong><p>Stačí lidsky, technické detaily nejsou nutné.</p></div></li><li><span>2</span><div><strong>Domluvíme postup</strong><p>Nejdřív potvrdíme, zda dává zásah smysl.</p></div></li><li><span>3</span><div><strong>Vyřešíme bezpečně</strong><p>Bez instalace pochybného softwaru a bez zbytečného přístupu k datům.</p></div></li></ol><div className="help-benefits"><span><Clock3 size={17} />Preferovaný termín zvolíte vy</span><span><LockKeyhole size={17} />Kontakt zůstává neveřejný</span><span><Check size={17} />Nezávazná poptávka</span></div></aside><ServiceRequestForm /></section></div>; }
