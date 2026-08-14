import type { FajnFeedMode } from "@/lib/job-feed/config";
import type { ParsedFajnJob } from "@/lib/job-feed/fajn-parser";

export type ExistingFajnJob = { id: string; external_id: string; source_hash: string | null; status?: string };
export function planFajnImport(existing: ExistingFajnJob[], incoming: ParsedFajnJob[], mode: FajnFeedMode) {
  const current = new Map(existing.map((job) => [job.external_id, job])); const incomingIds = new Set(incoming.map((job) => job.externalId));
  const inserts = incoming.filter((job) => !current.has(job.externalId));
  const updates = incoming.filter((job) => { const previous = current.get(job.externalId); return previous && (previous.source_hash !== job.sourceHash || previous.status !== "approved"); });
  const unchanged = incoming.filter((job) => { const previous = current.get(job.externalId); return previous && previous.source_hash === job.sourceHash && previous.status === "approved"; });
  const archiveIds = mode === "full_snapshot" ? existing.filter((job) => !incomingIds.has(job.external_id)).map((job) => job.id) : [];
  return { inserts, updates, unchanged, archiveIds };
}
