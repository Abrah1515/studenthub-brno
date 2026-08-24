import { NextResponse } from "next/server";
import { insertRecord, listRecords, updateRecord } from "@/lib/data-store";
import { consumeMarketplaceLimit, marketplaceEmailConfigured, recordMarketplaceHistory, relayMarketplaceContact } from "@/lib/marketplace-server";
import { requestFingerprint } from "@/lib/rate-limit";
import { marketplaceContactSchema } from "@/lib/schemas";
import { getCurrentAccount } from "@/lib/user-auth";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const account = await getCurrentAccount(); if (!account) return NextResponse.json({ message: "Pro kontaktování prodávajícího se přihlaste." }, { status: 401 });
  if (account.accountStatus !== "active") return NextResponse.json({ message: "Váš účet má komunitní funkce pozastavené." }, { status: 403 });
  if (!account.complete) return NextResponse.json({ message: "Před kontaktováním doplňte profil a přijměte pravidla komunity.", profileRequired: true }, { status: 428 });
  if (!marketplaceEmailConfigured() && process.env.DEMO_MODE !== "true") return NextResponse.json({ message: "Kontaktování je dočasně nedostupné, protože není nastavena produkční e-mailová brána." }, { status: 503 });
  if (!await consumeMarketplaceLimit(request, "contact", 8, 24 * 60 * 60)) return NextResponse.json({ message: "Limit zpráv byl vyčerpán. Zkuste to později." }, { status: 429 });
  const parsed = marketplaceContactSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte zprávu.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const id = (await context.params).id; const listing = (await listRecords("marketplace_listings")).find((row) => String(row.id) === id && ["active", "reserved"].includes(String(row.status)) && new Date(String(row.expires_at)).getTime() > Date.now());
  if (!listing) return NextResponse.json({ message: "Inzerát už není dostupný." }, { status: 404 });
  if (listing.seller_id === account.id) return NextResponse.json({ message: "Vlastní inzerát můžete spravovat přímo ze svého profilu." }, { status: 409 });
  if (process.env.DEMO_MODE === "true" && !marketplaceEmailConfigured()) return NextResponse.json({ message: "V demo režimu není e-mailový relay zapnutý; žádná zpráva nebyla odeslána." }, { status: 503 });
  const buyerEmail = account.email.toLowerCase();
  const saved = await insertRecord("marketplace_messages", { listing_id: id, buyer_id: account.id, buyer_email: buyerEmail, message: parsed.data.message, consent_at: new Date().toISOString(), request_fingerprint: requestFingerprint(request), delivery_status: "pending" });
  const delivery = await relayMarketplaceContact({ sellerEmail: String(listing.seller_email), buyerEmail, title: String(listing.title), message: parsed.data.message });
  await updateRecord("marketplace_messages", String(saved.id), { delivery_status: delivery.ok ? "sent" : "failed", delivery_provider_id: delivery.ok ? delivery.id : null });
  if (!delivery.ok) return NextResponse.json({ message: "Zprávu se nepodařilo doručit. Zkuste to později." }, { status: 502 });
  await updateRecord("marketplace_listings", id, { contact_count: Number(listing.contact_count || 0) + 1 }); await recordMarketplaceHistory(id, "contacted", listing.status, listing.status, "buyer");
  return NextResponse.json({ message: "Zpráva byla bezpečně předána prodávajícímu." }, { status: 201 });
}
