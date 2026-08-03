import { NextResponse } from "next/server";
import { defaultCitySlug } from "@/lib/cities";
import { getPublishedCity } from "@/lib/city-data";
import { insertRecord } from "@/lib/data-store";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { pageViewSchema } from "@/lib/schemas";
export async function POST(request: Request) { const fingerprint = requestFingerprint(request); if (!allowRequest(`view:${fingerprint}`, 120, 60 * 60 * 1000)) return new NextResponse(null, { status: 204 }); const parsed = pageViewSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Neplatná událost." }, { status: 422 }); const city = await getPublishedCity(parsed.data.cityId || defaultCitySlug); if (!city) return new NextResponse(null, { status: 204 }); await insertRecord("page_views", { path: parsed.data.path, city_id: city.id, university_id: parsed.data.universityId || null, faculty_id: parsed.data.facultyId || null, referral_code: parsed.data.referralCode || null, viewed_at: new Date().toISOString(), day_bucket: new Date().toISOString().slice(0, 10) }); return new NextResponse(null, { status: 204 }); }
