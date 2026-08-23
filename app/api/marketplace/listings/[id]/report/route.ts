import { NextResponse } from "next/server";
import { insertRecord, listRecords, updateRecord } from "@/lib/data-store";
import { consumeMarketplaceLimit } from "@/lib/marketplace-server";
import { requestFingerprint } from "@/lib/rate-limit";
import { marketplaceReportSchema } from "@/lib/schemas";
import { isSupabaseConfigured } from "@/lib/supabase-server";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  if (!await consumeMarketplaceLimit(request, "report", 10, 24 * 60 * 60)) return NextResponse.json({ message: "Limit hlášení byl vyčerpán." }, { status: 429 });
  const parsed = marketplaceReportSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte hlášení.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const id = (await context.params).id; const listing = (await listRecords("marketplace_listings")).find((row) => String(row.id) === id && ["active", "reserved", "sold", "hidden"].includes(String(row.status)));
  if (!listing) return NextResponse.json({ message: "Inzerát nebyl nalezen." }, { status: 404 });
  const reporterHash = requestFingerprint(request); const duplicate = (await listRecords("marketplace_reports")).some((row) => row.listing_id === id && row.reporter_hash === reporterHash);
  if (duplicate) return NextResponse.json({ message: "Tento inzerát už jste nahlásili." }, { status: 409 });
  await insertRecord("marketplace_reports", { listing_id: id, reporter_hash: reporterHash, reason: parsed.data.reason, detail: parsed.data.detail, status: "new" });
  if (!isSupabaseConfigured()) {
    const reportCount = (await listRecords("marketplace_reports")).filter((row) => row.listing_id === id && ["new", "reviewed"].includes(String(row.status))).length;
    await updateRecord("marketplace_listings", id, { report_count: reportCount, ...(reportCount >= 3 && ["active", "reserved", "sold"].includes(String(listing.status)) ? { status: "hidden", hidden_at: new Date().toISOString() } : {}) });
  }
  return NextResponse.json({ message: "Děkujeme. Hlášení jsme předali k posouzení." }, { status: 201 });
}
