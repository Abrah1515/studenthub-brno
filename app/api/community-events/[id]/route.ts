import { NextResponse } from "next/server";
import { communityEventFingerprint, managementTokenMatches, publicCommunityEvent, removeCommunityImage, sanitizePlainText } from "@/lib/community-events";
import { listRecords, updateRecord } from "@/lib/data-store";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { communityEventSchema, communityEventUpdateSchema } from "@/lib/schemas";
import { getCurrentAccount } from "@/lib/user-auth";

type Context = { params: Promise<{ id: string }> };
async function managedEvent(request: Request, id: string) { const row = (await listRecords("community_events")).find((item) => String(item.id) === id); const account = await getCurrentAccount(); if (!row) return null; if (row.author_id) return account?.complete && account.accountStatus === "active" && row.author_id === account.id ? { row, account } : null; return managementTokenMatches(request.headers.get("x-management-token"), row.management_token_hash) ? { row, account: null } : null; }

export async function GET(request: Request, context: Context) {
  const id = (await context.params).id; const managed = await managedEvent(request, id); if (!managed) return NextResponse.json({ message: "Akci nelze tímto účtem spravovat." }, { status: 404 });
  return NextResponse.json({ item: publicCommunityEvent(managed.row), status: managed.row.status }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request, context: Context) {
  if (!allowRequest(`community-edit:${requestFingerprint(request)}`, 20, 60 * 60 * 1000)) return NextResponse.json({ message: "Limit úprav byl vyčerpán." }, { status: 429 });
  const id = (await context.params).id; const managed = await managedEvent(request, id); if (!managed) return NextResponse.json({ message: "Akci nelze tímto účtem spravovat." }, { status: 404 }); const event = managed.row;
  if (["deleted", "archived"].includes(String(event.status))) return NextResponse.json({ message: "Ukončenou akci už nelze upravit." }, { status: 409 });
  const parsed = communityEventUpdateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte změny.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const value = parsed.data;
  const complete = communityEventSchema.safeParse({ title: value.title ?? event.title, category: value.category ?? event.category, startsAt: value.startsAt ?? event.starts_at, endsAt: value.endsAt ?? event.ends_at ?? "", venue: value.venue ?? event.venue, description: value.description ?? event.description, isFree: value.isFree ?? event.is_free, priceAmount: value.priceAmount ?? event.price_amount ?? undefined, eventUrl: value.eventUrl ?? event.event_url ?? "", publicVenueConsent: true, company: "", cityId: event.city_id });
  if (!complete.success) return NextResponse.json({ message: "Zkontrolujte změny.", issues: complete.error.flatten().fieldErrors }, { status: 422 });
  const fingerprint = communityEventFingerprint({ cityId: String(event.city_id), title: sanitizePlainText(value.title ?? String(event.title)), startsAt: value.startsAt ?? String(event.starts_at), venue: sanitizePlainText(value.venue ?? String(event.venue)) });
  const needsReview = Boolean(managed.account && !managed.account.trustedEventPublisher && event.status === "published");
  const saved = await updateRecord("community_events", id, { ...(value.title ? { title: sanitizePlainText(value.title) } : {}), ...(value.category ? { category: value.category } : {}), ...(value.startsAt ? { starts_at: value.startsAt } : {}), ...(value.endsAt !== undefined ? { ends_at: value.endsAt || null } : {}), ...(value.venue ? { venue: sanitizePlainText(value.venue) } : {}), ...(value.description ? { description: sanitizePlainText(value.description, true) } : {}), ...(value.isFree !== undefined ? { is_free: value.isFree, price_amount: value.isFree ? null : value.priceAmount } : value.priceAmount !== undefined ? { price_amount: complete.data.isFree ? null : value.priceAmount } : {}), ...(value.eventUrl !== undefined ? { event_url: value.eventUrl || null } : {}), duplicate_fingerprint: fingerprint, ...(needsReview ? { status: "pending" } : {}) });
  return NextResponse.json({ item: publicCommunityEvent(saved), status: saved.status, message: needsReview ? "Změna byla uložena a čeká na nové schválení." : "Akce byla upravena." });
}

export async function DELETE(request: Request, context: Context) {
  if (!allowRequest(`community-delete:${requestFingerprint(request)}`, 5, 60 * 60 * 1000)) return NextResponse.json({ message: "Limit operací byl vyčerpán." }, { status: 429 });
  const id = (await context.params).id; const managed = await managedEvent(request, id); if (!managed) return NextResponse.json({ message: "Akci nelze tímto účtem spravovat." }, { status: 404 }); const event = managed.row;
  await updateRecord("community_events", id, { status: "deleted", archived_at: new Date().toISOString(), author_email: "deleted@invalid.local" }); await removeCommunityImage(event.image_url);
  return new NextResponse(null, { status: 204 });
}
