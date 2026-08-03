import { NextResponse } from "next/server";
import { defaultCitySlug } from "@/lib/cities";
import { getPublishedCity } from "@/lib/city-data";
import { insertRecord } from "@/lib/data-store";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { jobSubmissionSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const fingerprint = requestFingerprint(request);
  if (!allowRequest(`job:${fingerprint}`, 3, 60 * 60 * 1000)) return NextResponse.json({ message: "Limit návrhů byl dočasně vyčerpán." }, { status: 429 });
  const parsed = jobSubmissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte vyplněné údaje.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const city = await getPublishedCity(parsed.data.cityId || defaultCitySlug);
  if (!city) return NextResponse.json({ message: "Vybrané město není aktivní." }, { status: 422 });
  const content = { companyName: parsed.data.companyName, title: parsed.data.title, contactEmail: parsed.data.contactEmail, location: parsed.data.location, reward: parsed.data.reward, workload: parsed.data.workload, description: parsed.data.description };
  await insertRecord("submissions", { city_id: city.id, type: "job", status: "pending", content, submitter_contact: content.contactEmail, consent_at: new Date().toISOString() });
  return NextResponse.json({ message: "Návrh byl uložen a čeká na kontrolu." }, { status: 201 });
}
