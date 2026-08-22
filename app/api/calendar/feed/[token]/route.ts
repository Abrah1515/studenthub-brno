import { academicCalendarDocument } from "@/lib/calendar-export";
import { listRecords, updateRecord } from "@/lib/data-store";
import { getPublishedCity } from "@/lib/city-data";
import { getAcademicCalendarEvents } from "@/lib/public-data";
import { liveCalendarTokenHash } from "@/lib/live-calendar-token";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const raw = (await params).token.replace(/\.ics$/, ""); if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return new Response("Odběr nebyl nalezen.", { status: 404 });
  const subscription = (await listRecords("calendar_subscriptions")).find((row) => row.token_hash === liveCalendarTokenHash(raw) && row.is_active); if (!subscription) return new Response("Odběr byl zrušen nebo neexistuje.", { status: 410 });
  const city = await getPublishedCity(String(subscription.city_id)); if (!city) return new Response("Město není aktivní.", { status: 404 });
  const events = await getAcademicCalendarEvents(city.id, { universityId: subscription.university_id ? String(subscription.university_id) : undefined, facultyId: subscription.faculty_id ? String(subscription.faculty_id) : undefined, studyYear: subscription.study_year ? Number(subscription.study_year) as 1 | 2 | 3 | 4 | 5 | 6 : undefined });
  const selected = events.filter((event) => !subscription.category || event.category === subscription.category);
  await updateRecord("calendar_subscriptions", String(subscription.id), { last_accessed_at: new Date().toISOString() });
  return new Response(academicCalendarDocument(selected, city.name), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300, stale-while-revalidate=300", "Content-Disposition": `inline; filename="studenthub-${city.slug}.ics"` } });
}
