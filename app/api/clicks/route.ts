import { NextResponse } from "next/server";
import { defaultCitySlug } from "@/lib/cities";
import { getPublishedCity } from "@/lib/city-data";
import { insertRecord } from "@/lib/data-store";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { outboundClickSchema } from "@/lib/schemas";
export async function POST(request: Request) { const fingerprint = requestFingerprint(request); if (!allowRequest(`click:${fingerprint}`, 60, 60 * 60 * 1000)) return new NextResponse(null, { status: 204 }); const parsed = outboundClickSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Neplatná událost." }, { status: 422 }); const city = await getPublishedCity(parsed.data.cityId || defaultCitySlug); if (!city) return new NextResponse(null, { status: 204 }); await insertRecord("outbound_clicks", { city_id: city.id, target_type: parsed.data.targetType, target_id: parsed.data.targetId, destination_host: parsed.data.destinationHost, university_id: parsed.data.universityId || null, faculty_id: parsed.data.facultyId || null, referral_code: parsed.data.referralCode || null, clicked_at: new Date().toISOString(), day_bucket: new Date().toISOString().slice(0, 10) }); return new NextResponse(null, { status: 204 }); }
