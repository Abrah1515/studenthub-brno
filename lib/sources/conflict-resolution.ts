export type ModificationBasis = "explicit_school_update" | "document_revision" | "http_last_modified" | "first_detected";
export type SourceRevision = { modifiedAt?: string | null; basis?: ModificationBasis | null };
export type ConflictDecision = "existing" | "proposed" | "needs_review";

const priority: Record<ModificationBasis, number> = { explicit_school_update: 4, document_revision: 3, http_last_modified: 2, first_detected: 1 };

export function decideSourceConflict(existing: SourceRevision, proposed: SourceRevision): ConflictDecision {
  const existingTime = existing.modifiedAt ? new Date(existing.modifiedAt).getTime() : Number.NaN;
  const proposedTime = proposed.modifiedAt ? new Date(proposed.modifiedAt).getTime() : Number.NaN;
  if (!Number.isFinite(existingTime) || !Number.isFinite(proposedTime)) return "needs_review";
  if (proposedTime > existingTime) return "proposed";
  if (proposedTime < existingTime) return "existing";
  const existingPriority = existing.basis ? priority[existing.basis] : 0;
  const proposedPriority = proposed.basis ? priority[proposed.basis] : 0;
  if (proposedPriority > existingPriority) return "proposed";
  if (proposedPriority < existingPriority) return "existing";
  return "needs_review";
}
