import { NextResponse } from "next/server";
import { ownerIdentity } from "@/lib/anonymous-owner";
import { deleteRecord, listRecords, updateRecord } from "@/lib/data-store";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { serviceRequestUpdateSchema } from "@/lib/schemas";

type Context = { params: Promise<{ id: string }> };

async function owned(request: Request, id: string) {
  const owner = ownerIdentity(request);
  return (await listRecords("service_requests")).find((row) => String(row.id) === id && row.owner_token_hash === owner.hash);
}

export async function PATCH(request: Request, context: Context) {
  if (!allowRequest(`help-edit:${requestFingerprint(request)}`, 20, 60 * 60 * 1000)) return NextResponse.json({ message: "Příliš mnoho změn." }, { status: 429 });
  const id = (await context.params).id; const row = await owned(request, id);
  if (!row) return NextResponse.json({ message: "Žádost nebyla nalezena nebo nepatří tomuto zařízení." }, { status: 404 });
  const parsed = serviceRequestUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte změny.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const data = parsed.data;
  const saved = await updateRecord("service_requests", id, { ...(data.publicTitle === undefined ? {} : { public_title: data.publicTitle }), ...(data.publicAlias === undefined ? {} : { public_alias: data.publicAlias }), ...(data.serviceType === undefined ? {} : { service_type: data.serviceType }), ...(data.description === undefined ? {} : { description: data.description }), ...(data.location === undefined ? {} : { location: data.location }), ...(data.preferredDate === undefined ? {} : { preferred_date: data.preferredDate }), moderation_status: "approved", published_at: new Date().toISOString() });
  return NextResponse.json({ id: saved.id, moderationStatus: saved.moderation_status, message: "Změna je ověřená a veřejná." });
}

export async function DELETE(request: Request, context: Context) {
  if (!allowRequest(`help-delete:${requestFingerprint(request)}`, 10, 60 * 60 * 1000)) return NextResponse.json({ message: "Příliš mnoho změn." }, { status: 429 });
  const id = (await context.params).id; const row = await owned(request, id);
  if (!row) return NextResponse.json({ message: "Žádost nebyla nalezena nebo nepatří tomuto zařízení." }, { status: 404 });
  await deleteRecord("service_requests", id); return new NextResponse(null, { status: 204 });
}
