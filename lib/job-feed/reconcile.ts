import type { FajnFeedMode } from "@/lib/job-feed/config";
import type { ParsedFajnJob } from "@/lib/job-feed/fajn-parser";

export type ExistingFajnJob = { id: string; external_id: string; source_hash: string | null; status?: string; missing_from_feed_runs?: number };
export function effectiveFajnImportMode(existing: ExistingFajnJob[], incomingCount: number, rejectedCount: number, requested: FajnFeedMode): FajnFeedMode {
  if (requested !== "full_snapshot" || rejectedCount > 0) return "incremental";
  const activeCount = existing.filter((row) => row.status !== "archived").length;
  return activeCount === 0 || incomingCount >= Math.ceil(activeCount * 0.6) ? "full_snapshot" : "incremental";
}
export function planFajnImport(existing: ExistingFajnJob[], incoming: ParsedFajnJob[], mode: FajnFeedMode) {
  const current = new Map(existing.map((job) => [job.external_id, job])); const incomingIds = new Set(incoming.map((job) => job.externalId));
  const inserts = incoming.filter((job) => !current.has(job.externalId));
  const updates = incoming.filter((job) => { const previous = current.get(job.externalId); return previous && (previous.source_hash !== job.sourceHash || previous.status !== "approved"); });
  const unchanged = incoming.filter((job) => { const previous = current.get(job.externalId); return previous && previous.source_hash === job.sourceHash && previous.status === "approved"; });
  const missing = mode === "full_snapshot"
    ? existing.filter((job) => job.status !== "archived" && !incomingIds.has(job.external_id)).map((job) => ({ id: job.id, count: Number(job.missing_from_feed_runs || 0) + 1 }))
    : [];
  // Jediný neúplný snapshot nesmí aktivní nabídku skrýt. Archivace nastane až
  // po třetím po sobě jdoucím úspěšném úplném snapshotu, ve kterém položka chybí.
  const archiveIds = missing.filter((job) => job.count >= 3).map((job) => job.id);
  return { inserts, updates, unchanged, missing, archiveIds };
}
