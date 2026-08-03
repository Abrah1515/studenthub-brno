import { NextResponse } from "next/server";
import { defaultCitySlug } from "@/lib/cities";
import { getPublishedCity } from "@/lib/city-data";
import { insertRecord } from "@/lib/data-store";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { contentSubmissionSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const fingerprint = requestFingerprint(request);
  if (!allowRequest(`club:${fingerprint}`, 5, 60 * 60 * 1000)) return NextResponse.json({ message: "Limit návrhů byl dočasně vyčerpán." }, { status: 429 });
  const parsed = contentSubmissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte vyplněné údaje.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const value = parsed.data; const city = await getPublishedCity(value.cityId || defaultCitySlug);
  if (!city) return NextResponse.json({ message: "Vybrané město není aktivní." }, { status: 422 });
  const content = { organizationName: value.organizationName, organizationType: value.organizationType, cityId: city.id, universityId: value.universityId, facultyId: value.facultyId || null, contentType: value.contentType, title: value.title, description: value.description, sourceUrl: value.sourceUrl || null };
  await insertRecord("submissions", { city_id: city.id, type: value.contentType, status: "pending", content, submitter_contact: value.contactEmail, university_id: value.universityId, faculty_id: value.facultyId || null, organization_name: value.organizationName, consent_at: new Date().toISOString() });
  return NextResponse.json({ message: "Návrh byl uložen." }, { status: 201 });
}
