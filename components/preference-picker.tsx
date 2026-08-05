"use client";

import { ArrowRight, CheckCircle2, GraduationCap, MapPinned, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { brnoCity, type City } from "@/lib/cities";
import { readPreference, resetPreference, savePreference } from "@/lib/client-preferences";
import type { AcademicCatalog } from "@/lib/types";
import { fallbackAcademicCatalog } from "@/lib/universities";
import { hasResolvedCookieConsent } from "@/components/cookie-consent";
import { useModalDialog } from "@/lib/use-modal-dialog";

export function PreferenceForm({ compact = false, onSaved, cities = [brnoCity], catalog = fallbackAcademicCatalog }: { compact?: boolean; onSaved?: () => void; cities?: City[]; catalog?: AcademicCatalog }) {
  const [cityId, setCityId] = useState(cities[0]?.id || "brno"); const [universityId, setUniversityId] = useState(""); const [facultyId, setFacultyId] = useState("");
  useEffect(() => {
    const update = () => { const initial = readPreference(catalog); setCityId(cities.some((city) => city.id === initial.cityId) ? initial.cityId : cities[0]?.id || "brno"); setUniversityId(initial.universityId || ""); setFacultyId(initial.facultyId || ""); };
    update(); window.addEventListener("studenthub-preference-changed", update); return () => window.removeEventListener("studenthub-preference-changed", update);
  }, [catalog, cities]);
  const availableUniversities = useMemo(() => catalog.universities.filter((item) => item.active), [catalog]);
  const availableFaculties = useMemo(() => catalog.faculties.filter((item) => item.active && item.universityId === universityId), [catalog, universityId]);
  function save() { savePreference({ cityId, universityId: universityId || null, facultyId: facultyId || null, completed: true }, catalog); onSaved?.(); }
  return <div className={`preference-form ${compact ? "compact" : ""}`}><label><span>Moje město</span><select aria-label="Moje město" value={cityId} onChange={(event) => { setCityId(event.target.value); setUniversityId(""); setFacultyId(""); }}>{cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label><label><span>Moje škola</span><select aria-label="Moje škola" value={universityId} onChange={(event) => { setUniversityId(event.target.value); setFacultyId(""); }}><option value="">Celé město / bez výběru</option>{availableUniversities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Moje fakulta</span><select aria-label="Moje fakulta" value={facultyId} onChange={(event) => setFacultyId(event.target.value)} disabled={!universityId}><option value="">Všechny fakulty</option>{availableFaculties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="button button-primary" type="button" onClick={save}>Uložit výběr <ArrowRight size={17} /></button></div>;
}

export function ResetPreferenceButton() { const [done, setDone] = useState(false); return <button className="button button-secondary reset-preferences" type="button" onClick={() => { resetPreference(); setDone(true); setTimeout(() => setDone(false), 2500); }}>{done ? <CheckCircle2 size={17} /> : <RotateCcw size={17} />}{done ? "Výběr byl resetován" : "Resetovat město a školu"}</button>; }

export function FirstRunPicker({ cities = [brnoCity], catalog = fallbackAcademicCatalog }: { cities?: City[]; catalog?: AcademicCatalog }) {
  const pathname = usePathname(); const [open, setOpen] = useState(false);
  useEffect(() => { const show = () => { if (!pathname.startsWith("/admin") && hasResolvedCookieConsent() && !readPreference(catalog).completed) setOpen(true); }; show(); window.addEventListener("studenthub-consent-changed", show); return () => window.removeEventListener("studenthub-consent-changed", show); }, [catalog, pathname]);
  const skip = () => { savePreference({ cityId: cities[0]?.id || "brno", universityId: null, facultyId: null, completed: true }, catalog); setOpen(false); };
  const dialogRef = useModalDialog(open, undefined, { closeOnEscape: false });
  if (!open) return null;
  const cityName = cities[0]?.name || "Brno";
  return <div ref={dialogRef} tabIndex={-1} className="onboarding-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" data-testid="first-run-picker" data-modal-layer><div className="onboarding-card"><div className="onboarding-head"><span className="onboarding-icon"><GraduationCap size={25} /></span></div><span className="eyebrow">Povinné úvodní nastavení</span><h2 id="onboarding-title">Vyberte město, školu a fakultu</h2><p>Výběr uložíme jen do tohoto zařízení. Přehled přizpůsobíme městu, škole a fakultě; kdykoli ho můžete změnit v nastavení.</p><PreferenceForm cities={cities} catalog={catalog} onSaved={() => setOpen(false)} /><button className="continue-link" onClick={skip}><MapPinned size={16} />Pokračovat vědomě bez výběru školy pro celé město {cityName}</button><small>Dialog nelze zavřít omylem. Nejde o přihlášení do školního systému a nikdy nechceme školní heslo.</small></div></div>;
}
