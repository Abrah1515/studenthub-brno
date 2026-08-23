import { NextResponse } from "next/server";
import { listRecords, updateRecord } from "@/lib/data-store";
import { marketplaceTokenMatches, recordMarketplaceHistory } from "@/lib/marketplace-server";
import { marketplaceVerificationSchema } from "@/lib/schemas";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const parsed = marketplaceVerificationSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Ověřovací odkaz není platný." }, { status: 422 });
  const id = (await context.params).id; const row = (await listRecords("marketplace_listings")).find((item) => String(item.id) === id);
  if (!row || row.status !== "pending_verification" || !marketplaceTokenMatches(parsed.data.verificationToken, row.verification_token_hash) || !marketplaceTokenMatches(parsed.data.managementToken, row.management_token_hash)) return NextResponse.json({ message: "Ověřovací odkaz není platný nebo už byl použit." }, { status: 404 });
  if (new Date(String(row.verification_expires_at)).getTime() <= Date.now()) { await updateRecord("marketplace_listings", id, { status: "rejected", automated_rejection_reason: "Ověřovací odkaz vypršel." }); return NextResponse.json({ message: "Ověřovací odkaz vypršel. Vytvořte inzerát znovu." }, { status: 410 }); }
  const now = new Date().toISOString(); const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await updateRecord("marketplace_listings", id, { status: "active", verification_token_hash: null, verification_expires_at: null, email_verified_at: now, published_at: now, expires_at: expiresAt });
  await recordMarketplaceHistory(id, "email_verified", "pending_verification", "active", "seller");
  return NextResponse.json({ message: "E-mail je ověřený a inzerát je zveřejněný.", managePath: `/${encodeURIComponent(String(row.city_id || "brno"))}/burza/sprava?id=${encodeURIComponent(id)}` });
}
