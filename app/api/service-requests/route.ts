import { NextResponse } from "next/server";
import { defaultCitySlug } from "@/lib/cities";
import { getPublishedCity } from "@/lib/city-data";
import { insertRecord } from "@/lib/data-store";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { serviceRequestSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const fingerprint = requestFingerprint(request);
  if (!allowRequest(`service:${fingerprint}`, 5, 60 * 60 * 1000)) return NextResponse.json({ message: "Příliš mnoho pokusů. Zkuste to prosím později." }, { status: 429 });
  const parsed = serviceRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte vyplněné údaje.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const data = parsed.data; const city = await getPublishedCity(data.cityId || defaultCitySlug);
  if (!city) return NextResponse.json({ message: "Vybrané město není aktivní." }, { status: 422 });
  const saved = await insertRecord("service_requests", { city_id: city.id, name: data.name, email: data.email || null, phone: data.phone || null, service_type: data.serviceType, description: data.description, preferred_date: data.preferredDate, consent_at: new Date().toISOString(), status: "new", source: "web" });
  const id = String(saved.id);
  return NextResponse.json({ message: "Děkujeme. Ozveme se přes uvedený kontakt, obvykle do jednoho pracovního dne.", reference: `SH-${id.slice(0, 8).toUpperCase()}` }, { status: 201 });
}
