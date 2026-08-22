import { NextResponse } from "next/server";
import { insertRecord, listRecords, updateRecord } from "@/lib/data-store";
import { ensureInstallation, installationCookie } from "@/lib/installation";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { placeLiveReportSchema } from "@/lib/schemas";
import { statusesForPlace, summarizePlaceLiveReports, type PlaceLiveCode } from "@/lib/place-live-status";
import { getPlaces } from "@/lib/public-data";

type Context = { params: Promise<{ id: string }> };
async function place(id: string) { return (await getPlaces("brno")).find((row) => row.id === id); }
async function summary(id: string) { const reports = (await listRecords("place_live_reports")).filter((row) => row.place_id === id && !row.hidden_at && new Date(String(row.expires_at)).getTime() > Date.now()); return summarizePlaceLiveReports(reports.map((row) => ({ status: String(row.status) as PlaceLiveCode, reportedAt: String(row.reported_at), installationId: String(row.installation_id), suspicious: Boolean(row.is_suspicious), hidden: Boolean(row.hidden_at) }))); }

export async function GET(_request: Request, context: Context) { const id = (await context.params).id; if (!await place(id)) return NextResponse.json({ message: "Místo nebylo nalezeno." }, { status: 404 }); return NextResponse.json({ summary: await summary(id) }, { headers: { "Cache-Control": "public, max-age=30" } }); }

export async function POST(request: Request, context: Context) {
  if (!allowRequest(`place-live:${requestFingerprint(request)}`, 20, 60 * 60 * 1000)) return NextResponse.json({ message: "Limit hlášení byl vyčerpán." }, { status: 429 });
  const id = (await context.params).id; const target = await place(id); if (!target) return NextResponse.json({ message: "Místo nebylo nalezeno." }, { status: 404 });
  const parsed = placeLiveReportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Tento stav pro místo nedává smysl." }, { status: 422 });
  if (!statusesForPlace(String(target.category)).includes(parsed.data.status)) return NextResponse.json({ message: "Tento stav pro místo nedává smysl." }, { status: 422 });
  const { identity, row: installation } = await ensureInstallation(request); const now = new Date(); const reportWindow = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000).toISOString();
  const existing = (await listRecords("place_live_reports")).find((row) => row.place_id === id && row.installation_id === installation.id && row.report_window === reportWindow);
  const values = { place_id: id, installation_id: installation.id, status: parsed.data.status, report_window: reportWindow, reported_at: now.toISOString(), expires_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), proximity_band: parsed.data.proximityBand, is_suspicious: false };
  if (existing) await updateRecord("place_live_reports", String(existing.id), values); else await insertRecord("place_live_reports", values);
  const response = NextResponse.json({ summary: await summary(id) }); installationCookie(response, identity); return response;
}
