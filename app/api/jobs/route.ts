import { NextResponse } from "next/server";
import { defaultCitySlug } from "@/lib/cities";
import { getPublishedCity } from "@/lib/city-data";
import { insertRecord, listRecords } from "@/lib/data-store";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { jobSubmissionSchema } from "@/lib/schemas";
import { getCurrentAccount } from "@/lib/user-auth";

export async function GET(request: Request) {
  const account=await getCurrentAccount();if(!account)return NextResponse.json({message:"Pro zobrazení vlastních návrhů se přihlaste."},{status:401});
  const mine=new URL(request.url).searchParams.get("scope")==="mine";if(!mine)return NextResponse.json({items:[]});
  const items=(await listRecords("submissions")).filter((row)=>row.type==="job"&&row.author_id===account.id&&row.status!=="deleted").sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).map((row)=>({id:row.id,status:row.status,content:row.content,createdAt:row.created_at,updatedAt:row.updated_at,moderationNote:row.moderation_note||null}));
  return NextResponse.json({items},{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request: Request) {
  const account=await getCurrentAccount();if(!account)return NextResponse.json({message:"Pro návrh brigády se přihlaste."},{status:401});if(!account.complete||account.accountStatus!=="active")return NextResponse.json({message:"Nejprve dokončete aktivní profil."},{status:403});
  const fingerprint = requestFingerprint(request);
  if (!allowRequest(`job:${fingerprint}`, 3, 60 * 60 * 1000)) return NextResponse.json({ message: "Limit návrhů byl dočasně vyčerpán." }, { status: 429 });
  const parsed = jobSubmissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte vyplněné údaje.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const city = await getPublishedCity(parsed.data.cityId || defaultCitySlug);
  if (!city) return NextResponse.json({ message: "Vybrané město není aktivní." }, { status: 422 });
  const content = { companyName: parsed.data.companyName, title: parsed.data.title, contactEmail: parsed.data.contactEmail, location: parsed.data.location, reward: parsed.data.reward, workload: parsed.data.workload, description: parsed.data.description };
  await insertRecord("submissions", { city_id: city.id, type: "job", author_id:account.id,status: "pending", content, submitter_contact: content.contactEmail, consent_at: new Date().toISOString() });
  return NextResponse.json({ message: "Návrh byl uložen a čeká na kontrolu." }, { status: 201 });
}
