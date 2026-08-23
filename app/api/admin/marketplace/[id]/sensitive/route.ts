import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { insertRecord, listRecords } from "@/lib/data-store";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  if (user.role !== "super_admin") return NextResponse.json({ message: "Citlivé údaje může zobrazit pouze hlavní superadministrátor." }, { status: 403 });
  const id = (await context.params).id;
  const listing = (await listRecords("marketplace_listings")).find((row) => String(row.id) === id);
  if (!listing) return NextResponse.json({ message: "Inzerát nebyl nalezen." }, { status: 404 });
  await insertRecord("marketplace_moderation_actions", { listing_id: id, actor_id: user.id, action: "view_sensitive", reason: "Zobrazení citlivých kontaktních údajů hlavním superadministrátorem.", snapshot: {} });
  const messages = (await listRecords("marketplace_messages")).filter((row) => row.listing_id === id).map((row) => ({ id: row.id, buyerEmail: row.buyer_email, message: row.message, deliveryStatus: row.delivery_status, createdAt: row.created_at }));
  return NextResponse.json({ sellerEmail: listing.seller_email, messages }, { headers: { "Cache-Control": "no-store" } });
}
