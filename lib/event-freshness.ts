export type EventFreshness = { label: string; tone: "fresh" | "waiting" | "stale" };

export function eventFreshness(lastVerifiedAt: string, now = new Date()): EventFreshness {
  const verifiedAt = new Date(lastVerifiedAt).getTime();
  const age = now.getTime() - verifiedAt;
  if (!Number.isFinite(verifiedAt) || age < 0) return { label: "Ověření zdroje probíhá", tone: "waiting" };
  if (age <= 12 * 60 * 60 * 1000) return { label: "Zdroj nedávno ověřen", tone: "fresh" };
  if (age <= 72 * 60 * 60 * 1000) return { label: "Zdroj čeká na další kontrolu", tone: "waiting" };
  return { label: "Zdroj ověřen před delší dobou", tone: "stale" };
}
