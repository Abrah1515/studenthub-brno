import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { syncEnabledSources } from "@/lib/sources/sync";
import { defaultCitySlug } from "@/lib/cities";
import { getPublishedCity } from "@/lib/city-data";
import { expireBuddyPosts } from "@/lib/buddy";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expectedBytes = Buffer.from(secret); const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

async function run(request: Request) {
  if (!authorized(request)) return NextResponse.json({ message: process.env.CRON_SECRET ? "Neplatná autorizace." : "CRON_SECRET není nastavený." }, { status: process.env.CRON_SECRET ? 401 : 503 });
  const university = new URL(request.url).searchParams.get("university") || undefined;
  const citySlug = new URL(request.url).searchParams.get("city") || defaultCitySlug; const city = await getPublishedCity(citySlug);
  if (!city) return NextResponse.json({ message: "Město není aktivní; synchronizace nebyla spuštěna." }, { status: 409 });
  const [results, expiredBuddyPosts] = await Promise.all([syncEnabledSources({ cityId: city.id, universityId: university }), expireBuddyPosts()]);
  return NextResponse.json({ ok: true, city: city.id, university: university || "all", expiredBuddyPosts, results: results.map((result) => result.status === "fulfilled" ? result.value : { status: "failed", message: result.reason instanceof Error ? result.reason.message : "Neznámá chyba" }) });
}

export const GET = run;
export const POST = run;
