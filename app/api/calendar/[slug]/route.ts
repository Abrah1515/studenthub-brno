import { defaultCitySlug } from "@/lib/cities";
import { getPublishedCity } from "@/lib/city-data";
import { getAcademicEvents } from "@/lib/public-data";
import { getAcademicCatalog } from "@/lib/academic-catalog";
import { resolveStudySelection } from "@/lib/universities";
import { calendarEventToIcs } from "@/lib/calendar-export";
import { parseStudyYear } from "@/lib/study-years";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const id = (await params).slug.replace(/\.ics$/, ""); const query = new URL(request.url).searchParams;
  const city = await getPublishedCity(query.get("city") || defaultCitySlug); if (!city) return new Response("Město nenalezeno.", { status: 404 });
  const requestedUniversity = query.get("university"); const requestedFaculty = query.get("faculty"); const requestedYear = query.get("year"); const category = query.get("category"); const textQuery = query.get("q")?.trim().toLocaleLowerCase("cs-CZ") || "";
  const resolved = resolveStudySelection(requestedUniversity, requestedFaculty, await getAcademicCatalog());
  if ((requestedUniversity && resolved.universityId !== requestedUniversity) || (requestedFaculty && resolved.facultyId !== requestedFaculty)) return new Response("Neplatná kombinace univerzity a fakulty.", { status: 400 });
  const studyYear = parseStudyYear(requestedYear);
  if (requestedYear && !studyYear) return new Response("Neplatný ročník.", { status: 400 });
  const events = await getAcademicEvents(city.id, { universityId: resolved.universityId || undefined, facultyId: resolved.facultyId || undefined, studyYear });
  const selected = events.filter((event) => (id === "all" || event.id === id) && (!category || event.category === category) && (!textQuery || `${event.title} ${event.description}`.toLocaleLowerCase("cs-CZ").includes(textQuery)));
  if (!selected.length) return new Response("Událost nenalezena.", { status: 404 });
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//StudentHub ${city.name}//Academic Calendar//CS`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH", ...selected.map((event) => calendarEventToIcs(event, city.name)), "END:VCALENDAR"].join("\r\n");
  return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="studenthub-${city.slug}-${id}.ics"`, "cache-control": "public, max-age=900" } });
}
