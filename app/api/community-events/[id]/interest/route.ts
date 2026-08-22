import { NextResponse } from "next/server";
import { deleteRecord, insertRecord, listRecords, updateRecord } from "@/lib/data-store";
import { ensureInstallation, installationCookie } from "@/lib/installation";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";

type Context = { params: Promise<{ id: string }> };
async function counts(id: string) { const rows = (await listRecords("community_event_interests")).filter((row) => row.event_id === id); return { count: rows.length, growth: rows.filter((row) => new Date(String(row.created_at)).getTime() >= Date.now() - 86_400_000).length }; }

export async function POST(request: Request, context: Context) {
  if (!allowRequest(`event-interest:${requestFingerprint(request)}`, 20, 60 * 60 * 1000)) return NextResponse.json({ message: "Příliš mnoho změn zájmu." }, { status: 429 });
  const id = (await context.params).id; const input = await request.json().catch(() => null) as { interested?: boolean } | null; if (typeof input?.interested !== "boolean") return NextResponse.json({ message: "Neplatná změna zájmu." }, { status: 422 });
  const event = (await listRecords("community_events")).find((row) => row.id === id && row.status === "published" && new Date(String(row.ends_at || row.starts_at)).getTime() >= Date.now()); if (!event) return NextResponse.json({ message: "Akce nebyla nalezena." }, { status: 404 });
  const { identity, row: installation } = await ensureInstallation(request); const existing = (await listRecords("community_event_interests")).find((row) => row.event_id === id && row.installation_id === installation.id);
  if (input.interested && !existing) await insertRecord("community_event_interests", { event_id: id, installation_id: installation.id }); if (!input.interested && existing) await deleteRecord("community_event_interests", String(existing.id));
  const result = await counts(id); await updateRecord("community_events", id, { interest_count: result.count, interest_last_24h: result.growth });
  const response = NextResponse.json({ interested: input.interested, ...result }); installationCookie(response, identity); return response;
}
