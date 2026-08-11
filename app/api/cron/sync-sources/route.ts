import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { syncDueSources } from "@/lib/sources/sync";
import { defaultCitySlug } from "@/lib/cities";
import { getPublishedCity } from "@/lib/city-data";
import { expireBuddyPosts } from "@/lib/buddy";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request) {
  const candidates = [
    [process.env.CRON_SECRET, request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")],
    [process.env.SUPABASE_SCHEDULER_SECRET, request.headers.get("x-studenthub-scheduler")],
  ] as const;
  return candidates.some(([expected, supplied]) => { if (!expected || !supplied) return false; const expectedBytes = Buffer.from(expected); const suppliedBytes = Buffer.from(supplied); return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes); });
}

async function run(request: Request) {
  const hasSchedulerSecret = Boolean(process.env.CRON_SECRET || process.env.SUPABASE_SCHEDULER_SECRET);
  if (!authorized(request)) return NextResponse.json({ message: hasSchedulerSecret ? "Neplatná autorizace." : "Tajemství plánovače není nastavené." }, { status: hasSchedulerSecret ? 401 : 503 });
  const university = new URL(request.url).searchParams.get("university") || undefined;
  const citySlug = new URL(request.url).searchParams.get("city") || defaultCitySlug; const city = await getPublishedCity(citySlug);
  if (!city) return NextResponse.json({ message: "Město není aktivní; synchronizace nebyla spuštěna." }, { status: 409 });
  const [results, expiredBuddyPosts] = await Promise.all([syncDueSources({ cityId: city.id, universityId: university, batchSize: 6 }), expireBuddyPosts()]);
  return NextResponse.json({ ok: true, city: city.id, university: university || "all", expiredBuddyPosts, results: results.map((result) => result.status === "fulfilled" ? result.value : { status: "failed", message: result.reason instanceof Error ? result.reason.message : "Neznámá chyba" }) });
}

export const GET = run;
export const POST = run;
