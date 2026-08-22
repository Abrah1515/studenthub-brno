import { NextResponse } from "next/server";
import { listRecords } from "@/lib/data-store";
import { summarizePlaceLiveReports } from "@/lib/place-live-status";

export async function GET(request: Request) {
  const ids = [...new Set((new URL(request.url).searchParams.get("ids") || "").split(",").filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 100);
  const reports = (await listRecords("place_live_reports")).filter((row) => ids.includes(String(row.place_id)) && !row.hidden_at && new Date(String(row.expires_at)).getTime() > Date.now());
  const summaries = Object.fromEntries(ids.map((id) => [id, summarizePlaceLiveReports(reports.filter((row) => row.place_id === id).map((row) => ({ status: String(row.status) as never, reportedAt: String(row.reported_at), installationId: String(row.installation_id), suspicious: Boolean(row.is_suspicious), hidden: Boolean(row.hidden_at) }))) ]));
  return NextResponse.json({ summaries }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=30" } });
}
