"use client";

import { ArrowRight, CheckCircle2, GraduationCap, MapPinned, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { brnoCity, type City } from "@/lib/cities";
import { readPreference, resetPreference, savePreference } from "@/lib/client-preferences";
import type { AcademicCatalog } from "@/lib/types";
import { fallbackAcademicCatalog } from "@/lib/universities";
import { hasResolvedCookieConsent } from "@/components/cookie-consent";
import { useModalDialog } from "@/lib/use-modal-dialog";

export function PreferenceForm({ compact = false, onSaved, cities = [brnoCity], catalog = fallbackAcademicCatalog }: { compact?: boolean; onSaved?: () => void; cities?: City[]; catalog?: AcademicCatalog }) {
  const [cityId, setCityId] = useState(cities[0]?.id || "brno"); const [universityId, setUniversityId] = useState(""); const [facultyId, setFacultyId] = useState(""); const [campusId, setCampusId] = useState("");
  useEffect(() => {
    const update = () => { const initial = readPreference(catalog); setCityId(cities.some((city) => city.id === initial.cityId) ? initial.cityId : cities[0]?.id || "brno"); setUniversityId(initial.universityId || ""); setFacultyId(initial.facultyId || ""); setCampusId(initial.campusId || ""); };
    update(); window.addEventListener("studenthub-preference-changed", update); return () => window.removeEventListener("studenthub-preference-changed", update);
  }, [catalog, cities]);
  const availableUniversities = useMemo(() => catalog.universities.filter((item) => item.active), [catalog]);
  const availableFaculties = useMemo(() => catalog.faculties.filter((item) => item.active && item.universityId === universityId), [catalog, universityId]);
  const availableCampuses = useMemo(() => catalog.universities.find((item) => item.id === universityId)?.campuses.filter((campus) => campus.cityId === cityId) || [], [catalog, cityId, universityId]);
  function save() { savePreference({ cityId, universityId: universityId || null, facultyId: facultyId || null, campusId: campusId || null, completed: true }, catalog); onSaved?.(); }
  return <div className={`preference-form ${compact ? "compact" : ""}`}>{cities.length > 1 && <label><span>Moje město</span><select value={cityId} onChange={(event) => { setCityId(event.target.value); setUniversityId(""); setFacultyId(""); setCampusId(""); }}>{cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>}<label><span>Moje škola</span><select aria-label="Moje škola" value={universityId} onChange={(event) => { setUniversityId(event.target.value); setFacultyId(""); setCampusId(""); }}><option value="">Celé město / bez výběru</option>{availableUniversities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Moje fakulta</span><select aria-label="Moje fakulta" value={facultyId} onChange={(event) => setFacultyId(event.target.value)} disabled={!universityId}><option value="">Všechny fakulty</option>{availableFaculties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{universityId && availableCampuses.length > 0 && <label><span>Můj kampus</span><select value={campusId} onChange={(event) => setCampusId(event.target.value)}><option value="">Všechny kampusy</option>{availableCampuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>}<button className="button button-primary" type="button" onClick={save}>Uložit výběr <ArrowRight size={17} /></button></div>;
}

export function ResetPreferenceButton() { const [done, setDone] = useState(false); return <button className="button button-secondary reset-preferences" type="button" onClick={() => { resetPreference(); setDone(true); setTimeout(() => setDone(false), 2500); }}>{done ? <CheckCircle2 size={17} /> : <RotateCcw size={17} />}{done ? "Výběr byl resetován" : "Resetovat město a školu"}</button>; }

export function FirstRunPicker({ cities = [brnoCity], catalog = fallbackAcademicCatalog }: { cities?: City[]; catalog?: AcademicCatalog }) {
  const pathname = usePathname(); const [open, setOpen] = useState(false);
  useEffect(() => { const show = () => { if (!pathname.startsWith("/admin") && hasResolvedCookieConsent() && !readPreference(catalog).completed) setOpen(true); }; show(); window.addEventListener("studenthub-consent-changed", show); return () => window.removeEventListener("studenthub-consent-changed", show); }, [catalog, pathname]);
  const skip = () => { savePreference({ cityId: cities[0]?.id || "brno", universityId: null, facultyId: null, campusId: null, completed: true }, catalog); setOpen(false); };
  const dialogRef = useModalDialog(open, skip);
  if (!open) return null;
  const cityName = cities[0]?.name || "Brno";
  return <div ref={dialogRef} tabIndex={-1} className="onboarding-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" data-testid="first-run-picker" data-modal-layer><div className="onboarding-card"><div className="onboarding-head"><span className="onboarding-icon"><GraduationCap size={25} /></span><button className="icon-button" data-autofocus onClick={skip} aria-label="Zavřít výběr školy"><X size={18} /></button></div><span className="eyebrow">Nastavení bez registrace</span><h2 id="onboarding-title">Co studujete ve městě {cityName}?</h2><p>Výběr uložíme jen do tohoto zařízení. Přehled přizpůsobíme městu, škole, fakultě a kampusu; kdykoli ho můžete změnit.</p><PreferenceForm cities={cities} catalog={catalog} onSaved={() => setOpen(false)} /><button className="continue-link" onClick={skip}><MapPinned size={16} />Pokračovat bez výběru školy pro celé město {cityName}</button><small>Nejde o přihlášení do školního systému a nikdy nechceme školní heslo.</small></div></div>;
}
