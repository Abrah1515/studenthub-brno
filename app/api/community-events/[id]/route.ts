import { NextResponse } from "next/server";
import { managementTokenMatches, publicCommunityEvent, removeCommunityImage, sanitizePlainText } from "@/lib/community-events";
import { listRecords, updateRecord } from "@/lib/data-store";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { communityEventSchema, communityEventUpdateSchema } from "@/lib/schemas";

type Context = { params: Promise<{ id: string }> };
async function managedEvent(request: Request, id: string) { const row = (await listRecords("community_events")).find((item) => String(item.id) === id); return row && managementTokenMatches(request.headers.get("x-management-token"), row.management_token_hash) ? row : null; }

export async function GET(request: Request, context: Context) {
  const id = (await context.params).id; const event = await managedEvent(request, id); if (!event) return NextResponse.json({ message: "Odkaz pro správu není platný." }, { status: 404 });
  return NextResponse.json({ item: publicCommunityEvent(event), status: event.status }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request, context: Context) {
  if (!allowRequest(`community-edit:${requestFingerprint(request)}`, 20, 60 * 60 * 1000)) return NextResponse.json({ message: "Limit úprav byl vyčerpán." }, { status: 429 });
  const id = (await context.params).id; const event = await managedEvent(request, id); if (!event) return NextResponse.json({ message: "Odkaz pro správu není platný." }, { status: 404 });
  if (["deleted", "archived"].includes(String(event.status))) return NextResponse.json({ message: "Ukončenou akci už nelze upravit." }, { status: 409 });
  const parsed = communityEventUpdateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte změny.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const value = parsed.data;
  const complete = communityEventSchema.safeParse({ title: value.title ?? event.title, category: value.category ?? event.category, startsAt: value.startsAt ?? event.starts_at, endsAt: value.endsAt ?? event.ends_at ?? "", venue: value.venue ?? event.venue, description: value.description ?? event.description, isFree: value.isFree ?? event.is_free, priceAmount: value.priceAmount ?? event.price_amount ?? undefined, eventUrl: value.eventUrl ?? event.event_url ?? "", authorEmail: event.author_email, publicVenueConsent: true, company: "", cityId: event.city_id });
  if (!complete.success) return NextResponse.json({ message: "Zkontrolujte změny.", issues: complete.error.flatten().fieldErrors }, { status: 422 });
  const saved = await updateRecord("community_events", id, { ...(value.title ? { title: sanitizePlainText(value.title) } : {}), ...(value.category ? { category: value.category } : {}), ...(value.startsAt ? { starts_at: value.startsAt } : {}), ...(value.endsAt !== undefined ? { ends_at: value.endsAt || null } : {}), ...(value.venue ? { venue: sanitizePlainText(value.venue) } : {}), ...(value.description ? { description: sanitizePlainText(value.description, true) } : {}), ...(value.isFree !== undefined ? { is_free: value.isFree, price_amount: value.isFree ? null : value.priceAmount } : value.priceAmount !== undefined ? { price_amount: complete.data.isFree ? null : value.priceAmount } : {}), ...(value.eventUrl !== undefined ? { event_url: value.eventUrl || null } : {}) });
  return NextResponse.json({ item: publicCommunityEvent(saved), message: "Akce byla upravena." });
}

export async function DELETE(request: Request, context: Context) {
  if (!allowRequest(`community-delete:${requestFingerprint(request)}`, 5, 60 * 60 * 1000)) return NextResponse.json({ message: "Limit operací byl vyčerpán." }, { status: 429 });
  const id = (await context.params).id; const event = await managedEvent(request, id); if (!event) return NextResponse.json({ message: "Odkaz pro správu není platný." }, { status: 404 });
  await updateRecord("community_events", id, { status: "deleted", archived_at: new Date().toISOString(), author_email: "deleted@invalid.local" }); await removeCommunityImage(event.image_url);
  return new NextResponse(null, { status: 204 });
}
