import "server-only";

import { insertRecord, listRecords } from "@/lib/data-store";
import { dueReminderDay } from "@/lib/watcher-reminder-time";

export async function materializeWatcherReminder(installationId: string, row: Record<string, unknown>, now = new Date()) {
  if (!row.is_watched || !row.event_starts_at) return false;
  const configured = Array.isArray(row.reminder_days) ? row.reminder_days.map(Number) : [7, 3, 1, 0];
  const day = dueReminderDay(String(row.event_starts_at), configured, now);
  if (day === undefined) return false;
  const snapshot = row.snapshot as Record<string, unknown> | undefined;
  const targetId = String(row.target_id);
  const dedupe = `reminder:${row.target_type}:${targetId}:${day}`;
  const existing = (await listRecords("internal_notifications")).some((item) => item.installation_id === installationId && item.dedupe_key === dedupe);
  if (existing) return false;
  const when = day === 0 ? "dnes" : day === 1 ? "zítra" : day === 3 ? "za tři dny" : "za týden";
  await insertRecord("internal_notifications", {
    installation_id: installationId,
    target_type: row.target_type,
    target_id: targetId,
    kind: "reminder",
    title: `Sledovaná událost je ${when}`,
    body: String(snapshot?.title || "Blíží se uložená událost."),
    destination_url: String(snapshot?.url || "/hlidac"),
    dedupe_key: dedupe,
    available_at: now.toISOString(),
  });
  return true;
}

export async function materializeDueWatcherNotifications(now = new Date()) {
  const saved = (await listRecords("saved_items")).filter((item) => item.is_watched);
  const created = await Promise.all(saved.map((item) => materializeWatcherReminder(String(item.installation_id), item, now)));
  return created.filter(Boolean).length;
}
