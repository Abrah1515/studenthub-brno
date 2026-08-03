import type { NormalizedEvent } from "@/lib/sources/types";

export type ExistingEvent = { id: string; external_id: string; source_hash: string | null; manual_override: boolean; starts_at: string; title: string; is_cancelled: boolean };
export function reconcileEvents(existing: ExistingEvent[], incoming: NormalizedEvent[]) {
  const byExternal = new Map(existing.map((event) => [event.external_id, event]));
  const incomingIds = new Set(incoming.map((event) => event.externalId));
  return { inserts: incoming.filter((event) => !byExternal.has(event.externalId)), updates: incoming.filter((event) => { const old = byExternal.get(event.externalId); return old && !old.manual_override && old.source_hash !== event.sourceHash; }), unchanged: incoming.filter((event) => byExternal.get(event.externalId)?.source_hash === event.sourceHash), archived: existing.filter((event) => !event.manual_override && !event.is_cancelled && !incomingIds.has(event.external_id) && new Date(event.starts_at) > new Date()) };
}
