import "server-only";

export type ProviderKind = "jobs" | "offers";
export type ProviderItem = { externalId: string; title: string; sourceUrl: string; updatedAt: string; expiresAt: string; payload: Record<string, unknown> };
export type ContentProvider = { id: string; kind: ProviderKind; format: "api" | "json" | "xml"; enabled: boolean; feedUrl?: string; fetchItems(): Promise<ProviderItem[]> };

function configuredProvider(id: string, kind: ProviderKind, format: ContentProvider["format"], flag: string | undefined, feedUrl: string | undefined): ContentProvider {
  const enabled = flag === "true" && Boolean(feedUrl);
  return { id, kind, format, enabled, feedUrl, async fetchItems() {
    if (!enabled || !feedUrl) return [];
    throw new Error(`Provider ${id} je připravený pouze pro smluvní feed. Implementaci adaptéru zapněte až po obdržení dokumentace a písemného souhlasu.`);
  } };
}

/** Žádný provider nepoužívá scraping. Ve výchozím stavu jsou oba smluvní feedy vypnuté. */
export function externalContentProviders(): ContentProvider[] {
  return [
    configuredProvider("fajn-brigady", "jobs", "xml", process.env.FAJN_BRIGADY_FEED_ENABLED, process.env.FAJN_BRIGADY_FEED_URL),
    configuredProvider("isic", "offers", "json", process.env.ISIC_FEED_ENABLED, process.env.ISIC_FEED_URL),
  ];
}

export function validateProviderItem(item: ProviderItem) {
  if (!item.externalId || !item.title || !item.sourceUrl.startsWith("https://")) return false;
  const updated = new Date(item.updatedAt).getTime(); const expires = new Date(item.expiresAt).getTime();
  return Number.isFinite(updated) && Number.isFinite(expires) && expires > Date.now();
}
