import { NextResponse } from "next/server";
import { deleteRecord, insertRecord, listRecords, updateRecord } from "@/lib/data-store";
import { ensureInstallation, installationCookie } from "@/lib/installation";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { savedItemSchema } from "@/lib/schemas";
import { getAcademicEvents, getCommunityEvents } from "@/lib/public-data";
import { materializeWatcherReminder } from "@/lib/watcher-notifications";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { identity, row: installation } = await ensureInstallation(request);
  const saved = (await listRecords("saved_items")).filter((item) => item.installation_id === installation.id);
  await Promise.all(saved.map((item) => materializeWatcherReminder(String(installation.id), item)));
  const [notifications, academic, community] = await Promise.all([
    listRecords("internal_notifications"), getAcademicEvents(String(installation.city_id || "brno")), getCommunityEvents(String(installation.city_id || "brno")),
  ]);
  const availableIds = new Set([...academic.map((item) => item.id), ...community.map((item) => item.id)]);
  const response = NextResponse.json({
    items: saved.map((item) => ({ id: item.id, targetType: item.target_type, targetId: item.target_id, favorite: item.is_favorite, watched: item.is_watched, reminderDays: item.reminder_days, snapshot: item.snapshot, available: availableIds.has(String(item.target_id)) })).sort((a, b) => String((a.snapshot as Record<string, unknown>)?.start || "").localeCompare(String((b.snapshot as Record<string, unknown>)?.start || ""))),
    notifications: notifications.filter((item) => item.installation_id === installation.id && new Date(String(item.available_at)).getTime() <= Date.now()).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map((item) => ({ id: item.id, kind: item.kind, title: item.title, body: item.body, url: item.destination_url, createdAt: item.created_at, read: Boolean(item.read_at) })),
  }, { headers: { "Cache-Control": "private, no-store" } });
  installationCookie(response, identity); return response;
}

export async function POST(request: Request) {
  if (!allowRequest(`watcher:${requestFingerprint(request)}`, 80, 60 * 60 * 1000)) return NextResponse.json({ message: "Příliš mnoho změn. Zkuste to později." }, { status: 429 });
  const parsed = savedItemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Neplatné nastavení Hlídače.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const input = parsed.data; const { identity, row: installation } = await ensureInstallation(request, input.preference);
  const existing = (await listRecords("saved_items")).find((item) => item.installation_id === installation.id && item.target_type === input.targetType && item.target_id === input.targetId);
  const favorite = input.favorite ?? Boolean(existing?.is_favorite); const watched = input.watched ?? Boolean(existing?.is_watched);
  if (!favorite && !watched) { if (existing) await deleteRecord("saved_items", String(existing.id)); }
  else {
    const values = { installation_id: installation.id, target_type: input.targetType, target_id: input.targetId, is_favorite: favorite, is_watched: watched, reminder_days: input.reminderDays || existing?.reminder_days || [7, 3, 1, 0], snapshot: input.snapshot, event_starts_at: input.snapshot.start };
    if (existing) await updateRecord("saved_items", String(existing.id), values); else await insertRecord("saved_items", values);
  }
  const response = NextResponse.json({ favorite, watched }); installationCookie(response, identity); return response;
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as { notificationId?: string; read?: boolean } | null;
  if (!body?.notificationId || typeof body.read !== "boolean") return NextResponse.json({ message: "Neplatná změna oznámení." }, { status: 422 });
  const { identity, row: installation } = await ensureInstallation(request);
  const notification = (await listRecords("internal_notifications")).find((item) => item.id === body.notificationId && item.installation_id === installation.id);
  if (!notification) return NextResponse.json({ message: "Oznámení nebylo nalezeno." }, { status: 404 });
  await updateRecord("internal_notifications", String(notification.id), { read_at: body.read ? new Date().toISOString() : null });
  const response = NextResponse.json({ ok: true }); installationCookie(response, identity); return response;
}
