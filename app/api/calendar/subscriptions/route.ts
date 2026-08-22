import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { ensureInstallation, installationCookie } from "@/lib/installation";
import { insertRecord, listRecords, updateRecord } from "@/lib/data-store";
import { calendarSubscriptionSchema } from "@/lib/schemas";
import { getPublishedCity } from "@/lib/city-data";
import { getAcademicCatalog } from "@/lib/academic-catalog";
import { resolveStudySelection } from "@/lib/universities";
import { liveCalendarTokenHash } from "@/lib/live-calendar-token";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = calendarSubscriptionSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Neplatný výběr kalendáře." }, { status: 422 });
  const input = parsed.data; const city = await getPublishedCity(input.cityId); if (!city) return NextResponse.json({ message: "Město není aktivní." }, { status: 404 });
  const scope = resolveStudySelection(input.universityId, input.facultyId, await getAcademicCatalog()); if ((input.universityId && scope.universityId !== input.universityId) || (input.facultyId && scope.facultyId !== input.facultyId)) return NextResponse.json({ message: "Fakulta nepatří k vybrané škole." }, { status: 422 });
  const { identity, row: installation } = await ensureInstallation(request, { cityId: city.id, universityId: scope.universityId, facultyId: scope.facultyId, studyYear: input.studyYear });
  const token = randomBytes(32).toString("base64url"); await insertRecord("calendar_subscriptions", { installation_id: installation.id, token_hash: liveCalendarTokenHash(token), city_id: city.id, university_id: scope.universityId || null, faculty_id: scope.facultyId || null, study_year: input.studyYear || null, category: input.category || null, is_active: true });
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin; const httpsUrl = `${origin}/api/calendar/feed/${token}.ics`; const response = NextResponse.json({ httpsUrl, webcalUrl: httpsUrl.replace(/^https:/, "webcal:") }, { status: 201 }); installationCookie(response, identity); return response;
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null) as { token?: string } | null; if (!body?.token || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) return NextResponse.json({ message: "Neplatný token odběru." }, { status: 422 });
  const token = body.token;
  const { identity, row: installation } = await ensureInstallation(request); const row = (await listRecords("calendar_subscriptions")).find((item) => item.installation_id === installation.id && item.token_hash === liveCalendarTokenHash(token)); if (!row) return NextResponse.json({ message: "Odběr nebyl nalezen." }, { status: 404 });
  await updateRecord("calendar_subscriptions", String(row.id), { is_active: false, revoked_at: new Date().toISOString() }); const response = NextResponse.json({ revoked: true }); installationCookie(response, identity); return response;
}
