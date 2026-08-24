import type { Metadata } from "next";
import { GraduationCap, LockKeyhole } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { PreferenceForm, ResetPreferenceButton } from "@/components/preference-picker";
import { getPublishedCities } from "@/lib/city-data";
import { getAcademicCatalog } from "@/lib/academic-catalog";
import { AccountProfilePanel } from "@/components/account-profile-panel";

export const metadata: Metadata = { title: "Moje škola a profil", description: "Nastavení personalizace a dobrovolného účtu StudentHub.", alternates: { canonical: "/nastaveni" }, robots: { index: false, follow: false } };
export default async function SettingsPage() { const [cities, catalog] = await Promise.all([getPublishedCities(), getAcademicCatalog()]); return <div className="page-stack settings-page"><PageHeading eyebrow="Účet není povinný" title="Moje škola a profil" description="Nejdřív nastavte místní personalizaci. Dobrovolný profil pod ní potřebujete jen pro publikování a komunikaci s ostatními studenty." /><section className="settings-card"><span className="settings-icon"><GraduationCap size={24} /></span><h2>Moje škola</h2><p>Vyberte město, školu, fakultu a případně ročník. Volba okamžitě upraví přehled a zůstane v tomto zařízení i po odhlášení.</p><PreferenceForm cities={cities} catalog={catalog} /></section><section className="settings-privacy"><LockKeyhole size={20} /><div><h2>Žádné školní heslo</h2><p>StudentHub se nepřihlašuje do školních systémů a nečte neveřejná data.</p></div></section><ResetPreferenceButton /><AccountProfilePanel catalog={catalog}/></div>; }
