import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { checkRegisteredLinks } from "@/lib/link-checker";

export const runtime = "nodejs";
export const maxDuration = 60;
function authorized(request: Request) { const secret = process.env.CRON_SECRET; if (!secret) return false; const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || ""; const a = Buffer.from(secret); const b = Buffer.from(supplied); return a.length === b.length && timingSafeEqual(a, b); }
export async function GET(request: Request) { if (!authorized(request)) return NextResponse.json({ message: process.env.CRON_SECRET ? "Neplatná autorizace." : "CRON_SECRET není nastavený." }, { status: process.env.CRON_SECRET ? 401 : 503 }); const results = await checkRegisteredLinks(); return NextResponse.json({ ok: true, checked: results.length, broken: results.filter((result) => result.status === "broken").length, blocked: results.filter((result) => result.status === "blocked").length, temporary: results.filter((result) => result.status === "temporary_failure").length }); }
