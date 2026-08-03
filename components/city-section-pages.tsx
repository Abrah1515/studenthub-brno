import { CalendarPlus } from "lucide-react";
import { AdSlot } from "@/components/ad-slot";
import { EventExplorer } from "@/components/event-explorer";
import { JobExplorer } from "@/components/job-explorer";
import { OffersExplorer } from "@/components/offers-explorer";
import { PageHeading } from "@/components/page-heading";
import { PlacesExplorer } from "@/components/places-explorer";
import type { City } from "@/lib/cities";
import { getAcademicEvents, getJobs, getOffers, getPlaces } from "@/lib/public-data";

export async function CityCalendarPage({ city, selection = {} }: { city: City; selection?: { universityId?: string; facultyId?: string } }) { const events = await getAcademicEvents(city.id, selection); const query = new URLSearchParams({ city: city.id }); if (selection.universityId) query.set("university", selection.universityId); if (selection.facultyId) query.set("faculty", selection.facultyId); return <div className="page-stack"><PageHeading eyebrow={`Vysoké školy · ${city.name}`} title="Akademický kalendář" description="Termíny přebíráme pouze z veřejných zdrojů. U každého záznamu uvádíme původ a poslední ověření; StudentHub nenahrazuje školní informační systém." actions={<a className="button button-secondary" href={`/api/calendar/all.ics?${query}`}><CalendarPlus size={18} />Stáhnout zobrazený kalendář</a>} /><EventExplorer events={events} cityId={city.id} initialUniversityId={selection.universityId} initialFacultyId={selection.facultyId} /></div>; }
export async function CityPlacesPage({ city }: { city: City }) { const places = await getPlaces(city.id); return <div className="page-stack"><PageHeading eyebrow={`Prakticky · ${city.name}`} title="Užitečná místa" description="Najděte místo na učení, knihovnu, menzu nebo servis. Každý záznam odkazuje na veřejný zdroj a seznam funguje i bez mapy." /><PlacesExplorer items={places} city={city} /></div>; }
export async function CityOffersPage({ city }: { city: City }) { const offers = await getOffers(city.id); return <div className="page-stack"><PageHeading eyebrow={`Šetřete chytře · ${city.name}`} title="Nabídky a slevy" description="Zveřejňujeme jen ověřené nabídky s platností a podmínkami. Sponzorovaný nebo affiliate obsah je vždy jasně označený." /><OffersExplorer items={offers} /><AdSlot label="Prostor pro férového lokálního partnera" /></div>; }
export async function CityJobsPage({ city }: { city: City }) { const jobs = await getJobs(city.id); return <div className="page-stack"><PageHeading eyebrow="Práce při studiu" title={`Brigády · ${city.name}`} description="Odměna a časová náročnost bez schovávání. Nabídky zveřejňujeme až po kontrole a po vypršení je archivujeme." /><JobExplorer items={jobs} /></div>; }
