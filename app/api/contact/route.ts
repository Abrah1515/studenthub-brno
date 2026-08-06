import { NextResponse } from "next/server";
import { brand } from "@/lib/brand";
import { insertRecord, updateRecord } from "@/lib/data-store";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { contactMessageSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!allowRequest(`contact:${requestFingerprint(request)}`, 3, 60 * 60 * 1000)) return NextResponse.json({ message: "Limit zpráv byl vyčerpán. Zkuste to později." }, { status: 429 });
  const parsed = contactMessageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte vyplněné údaje.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const value = parsed.data;
  const saved = await insertRecord("contact_messages", { name: value.name, email: value.email, subject: value.subject, message: value.message, city_id: value.cityId || "brno", status: "new" });
  const apiKey = process.env.RESEND_API_KEY; const from = process.env.CONTACT_FROM_EMAIL; const to = process.env.CONTACT_TO_EMAIL || brand.contactEmail;
  if (!apiKey || !from) {
    await updateRecord("contact_messages", String(saved.id), { status: "delivery_failed" });
    return NextResponse.json({ message: "Zprávu jsme bezpečně uložili, ale e-mailová brána zatím není nakonfigurovaná. Napište prosím přímo na studenthubbrno@gmail.com." }, { status: 503 });
  }
  const delivery = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [to], reply_to: value.email, subject: `[StudentHub] ${value.subject}`, text: `Jméno: ${value.name}\nE-mail: ${value.email}\n\n${value.message}` }), cache: "no-store" }).catch(() => null);
  if (!delivery?.ok) {
    await updateRecord("contact_messages", String(saved.id), { status: "delivery_failed" });
    return NextResponse.json({ message: "Zprávu jsme uložili, ale doručení e-mailu se nezdařilo. Zkuste to později nebo napište přímo na studenthubbrno@gmail.com." }, { status: 502 });
  }
  const result = await delivery.json().catch(() => ({})) as { id?: string };
  await updateRecord("contact_messages", String(saved.id), { status: "sent", delivery_provider_id: result.id || null });
  return NextResponse.json({ message: "Děkujeme. Zpráva byla odeslána týmu StudentHub Brno." }, { status: 201 });
}
