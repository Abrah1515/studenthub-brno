import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CalendarDays, GraduationCap, MapPin, ShieldCheck, Sparkles, Users } from "lucide-react";
import { SchoolHubActions } from "@/components/school-hub-actions";
import type { City } from "@/lib/cities";
import { getAcademicEvents, getJobs, getOffers, getPlaces } from "@/lib/public-data";
import { formatShortDate } from "@/lib/format";
import { universityById } from "@/lib/universities";
import { relevantAcademicEvents } from "@/lib/event-lifecycle";
import { featureFlags } from "@/lib/feature-flags";

export async function SchoolHub({ universityId, city }: { universityId: string; city: City }) {
  const university = universityById(universityId); if (!university) return null;
  const base = `/${city.slug}`;
  const [events, places, offers, jobs] = await Promise.all([getAcademicEvents(city.id), getPlaces(city.id), featureFlags.offersEnabled ? getOffers(city.id) : Promise.resolve([]), getJobs(city.id)]);
  const schoolEvents = relevantAcademicEvents(events.filter((item) => item.scope === "city" || item.scope === "brno" || item.universityId === universityId)).slice(0, 4);
  const schoolOffers = offers.filter((item) => !item.universityIds?.length || item.universityIds.includes(universityId)).slice(0, 4);
  const schoolPlaces = places.filter((item) => !item.universityIds?.length || item.universityIds.includes(universityId));
  const schoolJobs = jobs.filter((item) => !item.universityIds?.length || item.universityIds.includes(universityId));
  return <div className="page-stack school-hub">
    <header className="school-hero"><div className="school-monogram" style={{ backgroundColor: university.color }}>{university.shortName.slice(0, 2)}</div><div><span className="eyebrow">Studentský rozcestník · {university.shortName}</span><h1>{university.name}</h1><p>Společná vrstva pro místa, nabídky, brigády, veřejné akce a praktickou pomoc ve městě {city.name}.</p></div><SchoolHubActions universityId={universityId} referral={`${city.slug}-${university.slug}-studenti`} /></header>
    <div className="independent-banner"><ShieldCheck size={19} /><p><strong>Nezávislý projekt:</strong> StudentHub {city.name} není oficiální službou {university.name}, nepoužívá její logo a nenahrazuje školní informační systém.</p></div>
    <section className="school-summary"><article><CalendarDays size={19} /><strong>{schoolEvents.length}</strong><span>ověřené termíny</span></article>{featureFlags.offersEnabled && <article><Sparkles size={19} /><strong>{schoolOffers.length}</strong><span>relevantní nabídky</span></article>}<article><MapPin size={19} /><strong>{schoolPlaces.length}</strong><span>užitečná místa</span></article><article><BriefcaseBusiness size={19} /><strong>{schoolJobs.length}</strong><span>vybrané brigády</span></article></section>
    <div className={featureFlags.offersEnabled && schoolOffers.length ? "school-grid" : undefined}><section className="dashboard-section"><div className="section-head"><div><span className="section-icon"><CalendarDays size={17} /></span><h2>Veřejné termíny a akce</h2></div><Link href={`${base}/kalendar?university=${universityId}`}>Všechny <ArrowRight size={16} /></Link></div><div className="school-list">{schoolEvents.length ? schoolEvents.map((event) => <Link href={`${base}/kalendar#${event.id}`} key={event.id}><time>{formatShortDate(event.start)}</time><div><strong>{event.title}</strong><small>{event.source}</small></div></Link>) : <p className="muted">Zatím nemáme ověřené budoucí termíny.</p>}</div></section>{featureFlags.offersEnabled && schoolOffers.length > 0 && <section className="dashboard-section"><div className="section-head"><div><span className="section-icon"><Sparkles size={17} /></span><h2>Nabídky pro studenty</h2></div><Link href={`${base}/nabidky?university=${universityId}`}>Všechny <ArrowRight size={16} /></Link></div><div className="school-list">{schoolOffers.map((offer) => <Link href={`${base}/nabidky#${offer.id}`} key={offer.id}><time>{offer.discount}</time><div><strong>{offer.title}</strong><small>{offer.partner}</small></div></Link>)}</div></section>}</div>
    <section className="school-places-section"><div><span className="eyebrow">Podle školy</span><h2>Užitečná místa pro studenty {university.shortName}</h2></div><p className="muted">Místa lze filtrovat podle školy a fakulty nebo zobrazit společně pro celé město.</p><Link href={`${base}/mista?university=${universityId}`} className="button button-secondary">Zobrazit {schoolPlaces.length} míst na mapě <ArrowRight size={15} /></Link></section>
    <section className="club-cta"><Users size={25} /><div><h2>Jste studentský spolek?</h2><p>Pošlete veřejnou akci, nabídku nebo tip ke schválení. Přihlášení do školního systému není potřeba.</p></div><Link href={`/navrhnout-obsah?city=${city.id}&university=${universityId}`} className="button button-primary"><GraduationCap size={17} />Navrhnout obsah</Link></section>
  </div>;
}
