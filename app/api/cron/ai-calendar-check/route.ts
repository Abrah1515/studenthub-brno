import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runAcademicCalendarAiCheck } from "@/lib/academic-calendar-ai";
import { getPublishedCities } from "@/lib/city-data";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const candidates = [
    [process.env.CRON_SECRET, request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")],
    [process.env.SUPABASE_SCHEDULER_SECRET, request.headers.get("x-studenthub-scheduler")],
  ] as const;
  return candidates.some(([expected, supplied]) => {
    if (!expected || !supplied) return false;
    const left = Buffer.from(expected); const right = Buffer.from(supplied);
    return left.length === right.length && timingSafeEqual(left, right);
  });
}

async function run(request: Request) {
  const configured = Boolean(process.env.CRON_SECRET || process.env.SUPABASE_SCHEDULER_SECRET);
  if (!authorized(request)) return NextResponse.json({ message: configured ? "Neplatná autorizace." : "Tajemství plánovače není nastavené." }, { status: configured ? 401 : 503 });
  const url = new URL(request.url);
  const city = url.searchParams.get("city") || "brno";
  try {
    if (url.searchParams.get("scope") === "all") {
      const cities = await getPublishedCities();
      const results = await Promise.all(cities.map(async (publishedCity) => ({
          city: publishedCity.id,
          ...(await runAcademicCalendarAiCheck({ trigger: "scheduled", cityId: publishedCity.id })),
      })));
      const failed = results.filter((result) => result.status === "failed");
      return NextResponse.json({ ok: failed.length === 0, cities: results }, { status: failed.length ? 500 : 200 });
    }
    const result = await runAcademicCalendarAiCheck({ trigger: "scheduled", cityId: city });
    return NextResponse.json({ ok: result.status === "completed", city, ...result }, { status: result.status === "completed" ? 200 : result.status === "failed" ? 500 : 503 });
  }
  catch (error) { return NextResponse.json({ ok: false, city, message: error instanceof Error ? error.message : "Kontrola kalendáře selhala." }, { status: 500 }); }
}

export const GET = run;
export const POST = run;
