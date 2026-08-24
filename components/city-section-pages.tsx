import { AdSlot } from "@/components/ad-slot";
import { CalendarHub } from "@/components/calendar-hub";
import { JobExplorer } from "@/components/job-explorer";
import { OffersExplorer } from "@/components/offers-explorer";
import { PageHeading } from "@/components/page-heading";
import { PlacesExplorer } from "@/components/places-explorer";
import { PwaInstallButton } from "@/components/pwa-install";
import type { City } from "@/lib/cities";
import type { StudyYear } from "@/lib/types";
import { getAcademicEvents, getCommunityEvents, getJobs, getOffers, getPlaces } from "@/lib/public-data";
import { getCurrentAccount } from "@/lib/user-auth";

export async function CityCalendarPage({ city, selection = {} }: { city: City; selection?: { universityId?: string; facultyId?: string; studyYear?: StudyYear } }) { const viewer = await getCurrentAccount(); const [events, communityEvents] = await Promise.all([getAcademicEvents(city.id), getCommunityEvents(city.id, viewer?.id)]); return <div className="page-stack"><PageHeading eyebrow={`Vysoké školy · ${city.name}`} title="Kalendář" description="Ověřené školní termíny a komunitní studentské akce na jednom místě. StudentHub nenahrazuje školní informační systém." /><CalendarHub academicEvents={events} communityEvents={communityEvents} cityId={city.id} initialUniversityId={selection.universityId} initialFacultyId={selection.facultyId} initialStudyYear={selection.studyYear} /></div>; }
export async function CityPlacesPage({ city }: { city: City }) { const places = await getPlaces(city.id); return <div className="page-stack"><PageHeading eyebrow={`Prakticky · ${city.name}`} title="Užitečná místa" description="Najděte místo na učení, knihovnu, menzu nebo servis. Každý záznam odkazuje na veřejný zdroj a seznam funguje i bez mapy." actions={<PwaInstallButton placement="action" />} /><PlacesExplorer items={places} city={city} /></div>; }
export async function CityOffersPage({ city }: { city: City }) { const offers = await getOffers(city.id); return <div className="page-stack"><PageHeading eyebrow={`Šetřete chytře · ${city.name}`} title="Nabídky a slevy" description="Zveřejňujeme jen ověřené nabídky s platností a podmínkami. Sponzorovaný nebo affiliate obsah je vždy jasně označený." /><OffersExplorer items={offers} /><AdSlot label="Prostor pro férového lokálního partnera" /></div>; }
export async function CityJobsPage({ city }: { city: City }) { const jobs = await getJobs(city.id); return <div className="page-stack"><PageHeading eyebrow="Práce při studiu" title={`Brigády · ${city.name}`} description="Odměna a časová náročnost bez schovávání. Nabídky zveřejňujeme až po kontrole a po vypršení je archivujeme." /><JobExplorer items={jobs} /></div>; }
