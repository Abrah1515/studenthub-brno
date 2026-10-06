import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin-auth";
import { adminSectionAllowed } from "@/lib/admin-sections";
import { CALENDAR_REVIEW_VERSION, calendarAiConfiguration, runAcademicCalendarAiCheck } from "@/lib/academic-calendar-ai";
import { getPublishedCities, getUniversityIdsForPublishedCity } from "@/lib/city-data";
import { createServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

async function resolveCity(user: NonNullable<Awaited<ReturnType<typeof getAdminUser>>>, requestedCityId: string | null) {
  const cities = await getPublishedCities();
  const selectedId = user.role === "super_admin" ? requestedCityId || "brno" : user.cityId;
  const city = cities.find((item) => item.id === selectedId || item.slug === selectedId);
  return { city, cities: user.role === "super_admin" ? cities : cities.filter((item) => item.id === user.cityId) };
}

export async function GET(request: Request) {
  const user = await getAdminUser();
  if (!user || !adminSectionAllowed("calendar_ai", user.role)) return NextResponse.json({ message: "Nemáte oprávnění." }, { status: 403 });
  const requestedCityId = new URL(request.url).searchParams.get("city");
  const { city, cities } = await resolveCity(user, requestedCityId);
  if (!city) return NextResponse.json({ message: "Město není dostupné nebo není ve vašem rozsahu." }, { status: 403 });
  const cityId = city.id;
  const client = createServiceClient();
  const { data: sources, error: sourcesError } = await client.from("content_sources").select("id,faculty_id,university_id,city_id").eq("source_type", "academic_calendar").eq("enabled", true);
  if (sourcesError) return NextResponse.json({ message: "Zdroje se nepodařilo načíst." }, { status: 500 });
  const universities = await getUniversityIdsForPublishedCity(cityId);
  const sourceIds = (sources || []).filter((row) => row.city_id === cityId || (!row.city_id && universities.includes(String(row.university_id)))).map((row) => String(row.id));
  const runsQuery = client.from("academic_calendar_ai_runs").select("*").eq("city_id", cityId).eq("ai_provider", CALENDAR_REVIEW_VERSION).order("started_at", { ascending: false }).limit(25);
  const { data: runs, error: runsError } = await runsQuery;
  if (runsError) return NextResponse.json({ message: "Stav kontroly se nepodařilo načíst." }, { status: 500 });
  const { data: successfulRuns, error: successfulRunsError } = await client.from("academic_calendar_ai_runs").select("id,started_at,finished_at,status").eq("city_id", cityId).eq("ai_provider", CALENDAR_REVIEW_VERSION).eq("status", "completed").order("finished_at", { ascending: false }).limit(1);
  if (successfulRunsError) return NextResponse.json({ message: "Poslední úspěšnou kontrolu se nepodařilo načíst." }, { status: 500 });
  const findingsQuery = client.from("academic_calendar_ai_findings").select("*").eq("city_id", cityId).eq("ai_reason", CALENDAR_REVIEW_VERSION).order("checked_at", { ascending: false }).limit(500);
  const { data: findings, error: findingsError } = await findingsQuery;
  if (findingsError) return NextResponse.json({ message: "Nálezy se nepodařilo načíst." }, { status: 500 });
  const latest = runs?.[0] || null;
  return NextResponse.json({ city: { id: city.id, name: city.name }, availableCities: cities.map((item) => ({ id: item.id, name: item.name })), configuration: calendarAiConfiguration(), latest, lastSuccessful: successfulRuns?.[0] || null, runs: runs || [], findings: findings || [], stats: { sources: sourceIds.length, openFindings: (findings || []).filter((row) => ["new", "needs_review", "cannot_verify"].includes(String(row.status))).length, unavailable: Number(latest?.unavailable_source_count || 0), conflicts: Number(latest?.conflict_count || 0) } });
}

export async function POST(request: Request) {
  const user = await getAdminUser();
  if (!user || !["super_admin", "admin"].includes(user.role)) return NextResponse.json({ message: "Ruční spuštění je povoleno pouze administrátorovi města." }, { status: 403 });
  const parsed = z.object({ cityId: z.string().max(100).optional(), sourceId: z.string().max(100).optional() }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ message: "Neplatný zdroj kontroly." }, { status: 400 });
  try {
    const { city } = await resolveCity(user, parsed.data.cityId || null);
    if (!city) return NextResponse.json({ message: "Město není dostupné nebo není ve vašem rozsahu." }, { status: 403 });
    const result = await runAcademicCalendarAiCheck({ trigger: "manual", cityId: city.id, actorId: user.id, targetSourceId: parsed.data.sourceId || null });
    return NextResponse.json(result, { status: result.status === "completed" ? 200 : result.status === "failed" ? 500 : 503 });
  }
  catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Kontrolu se nepodařilo spustit." }, { status: 500 }); }
}
