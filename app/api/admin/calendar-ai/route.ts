import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin-auth";
import { adminSectionAllowed } from "@/lib/admin-sections";
import { calendarAiConfiguration, runAcademicCalendarAiCheck } from "@/lib/academic-calendar-ai";
import { getUniversityIdsForPublishedCity } from "@/lib/city-data";
import { createServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAdminUser();
  if (!user || !adminSectionAllowed("calendar_ai", user.role) || (user.role !== "super_admin" && user.cityId !== "brno")) return NextResponse.json({ message: "Nemáte oprávnění." }, { status: 403 });
  const client = createServiceClient();
  const { data: sources, error: sourcesError } = await client.from("content_sources").select("id,faculty_id,university_id,city_id").eq("source_type", "academic_calendar").eq("enabled", true);
  if (sourcesError) return NextResponse.json({ message: "Zdroje se nepodařilo načíst." }, { status: 500 });
  const universities = await getUniversityIdsForPublishedCity("brno");
  const sourceIds = (sources || []).filter((row) => row.city_id === "brno" || (!row.city_id && universities.includes(String(row.university_id)))).map((row) => String(row.id));
  const runsQuery = client.from("academic_calendar_ai_runs").select("*").eq("city_id", "brno").order("started_at", { ascending: false }).limit(25);
  const { data: runs, error: runsError } = await runsQuery;
  if (runsError) return NextResponse.json({ message: "Stav kontroly se nepodařilo načíst." }, { status: 500 });
  const { data: successfulRuns, error: successfulRunsError } = await client.from("academic_calendar_ai_runs").select("id,started_at,finished_at,status").eq("city_id", "brno").eq("status", "completed").order("finished_at", { ascending: false }).limit(1);
  if (successfulRunsError) return NextResponse.json({ message: "Poslední úspěšnou kontrolu se nepodařilo načíst." }, { status: 500 });
  const findingsQuery = client.from("academic_calendar_ai_findings").select("*").eq("city_id", "brno").order("checked_at", { ascending: false }).limit(500);
  const { data: findings, error: findingsError } = await findingsQuery;
  if (findingsError) return NextResponse.json({ message: "Nálezy se nepodařilo načíst." }, { status: 500 });
  const latest = runs?.[0] || null;
  return NextResponse.json({ configuration: calendarAiConfiguration(), latest, lastSuccessful: successfulRuns?.[0] || null, runs: runs || [], findings: findings || [], stats: { sources: sourceIds.length, openFindings: (findings || []).filter((row) => ["new", "needs_review", "cannot_verify"].includes(String(row.status))).length, unavailable: Number(latest?.unavailable_source_count || 0), conflicts: Number(latest?.conflict_count || 0) } });
}

export async function POST(request: Request) {
  const user = await getAdminUser();
  if (!user || !["super_admin", "admin"].includes(user.role) || (user.role !== "super_admin" && user.cityId !== "brno")) return NextResponse.json({ message: "Ruční spuštění je povoleno pouze administrátorovi Brna." }, { status: 403 });
  const parsed = z.object({ sourceId: z.string().max(100).optional() }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ message: "Neplatný zdroj kontroly." }, { status: 400 });
  try {
    const result = await runAcademicCalendarAiCheck({ trigger: "manual", cityId: "brno", actorId: user.id, targetSourceId: parsed.data.sourceId || null });
    return NextResponse.json(result, { status: result.status === "completed" ? 200 : result.status === "failed" ? 500 : 503 });
  }
  catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Kontrolu se nepodařilo spustit." }, { status: 500 }); }
}
