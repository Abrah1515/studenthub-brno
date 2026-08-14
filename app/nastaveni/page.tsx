import type { Metadata } from "next";
import { GraduationCap, LockKeyhole } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { PreferenceForm, ResetPreferenceButton } from "@/components/preference-picker";
import { getPublishedCities } from "@/lib/city-data";
import { getAcademicCatalog } from "@/lib/academic-catalog";

export const metadata: Metadata = { title: "Moje škola, fakulta a ročník", description: "Nastavení personalizace StudentHubu bez registrace.", alternates: { canonical: "/nastaveni" } };
export default async function SettingsPage() { const [cities, catalog] = await Promise.all([getPublishedCities(), getAcademicCatalog()]); return <div className="page-stack settings-page"><PageHeading eyebrow="Bez registrace" title="Moje město, škola, fakulta a ročník" description="Volba ovlivní doporučené termíny, nabídky, místa a brigády. Zůstává pouze v tomto zařízení." /><section className="settings-card"><span className="settings-icon"><GraduationCap size={24} /></span><h2>Personalizace přehledu</h2><p>Vyberte město, školu, fakultu a případně ročník. Výběr můžete kdykoli změnit.</p><PreferenceForm cities={cities} catalog={catalog} /></section><section className="settings-privacy"><LockKeyhole size={20} /><div><h2>Žádné školní heslo</h2><p>StudentHub se nepřihlašuje do IS MUNI, VUT ani jiného školního systému. Nečte neveřejná data a tento výběr není uživatelský účet.</p></div></section><ResetPreferenceButton /></div>; }
