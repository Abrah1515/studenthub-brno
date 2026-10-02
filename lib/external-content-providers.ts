import "server-only";
import { fajnFeedConfig } from "@/lib/job-feed/config";

export type ProviderKind = "jobs" | "offers";
export type ProviderItem = { externalId: string; title: string; sourceUrl: string; updatedAt: string; expiresAt: string; payload: Record<string, unknown> };
export type ContentProvider = { id: string; kind: ProviderKind; format: "api" | "json" | "xml"; enabled: boolean; permissionConfirmed: boolean; maxCheckIntervalHours: 9; statusReason: string; feedUrl?: string; fetchItems(): Promise<ProviderItem[]> };

function configuredProvider(id: string, kind: ProviderKind, format: ContentProvider["format"], flag: string | undefined, permissionFlag: string | undefined, feedUrl: string | undefined): ContentProvider {
  const permissionConfirmed = permissionFlag === "true";
  const enabled = flag === "true" && permissionConfirmed && Boolean(feedUrl);
  const statusReason = !permissionConfirmed ? "Vypnuto: chybí potvrzení písemného oprávnění." : !feedUrl ? "Vypnuto: není nastaven smluvní feed." : flag !== "true" ? "Vypnuto feature flagem." : "Zapnuto pro smluvní feed.";
  return { id, kind, format, enabled, permissionConfirmed, maxCheckIntervalHours: 9, statusReason, feedUrl, async fetchItems() {
    if (!enabled || !feedUrl) return [];
    throw new Error(`Provider ${id} je připravený pouze pro smluvní feed. Implementaci adaptéru zapněte až po obdržení dokumentace a písemného souhlasu.`);
  } };
}

/** Žádný provider nepoužívá scraping. Každé město má vlastní smluvní XML feed. */
export function externalContentProviders(): ContentProvider[] {
  const fajn = (["brno", "praha", "olomouc"] as const).map((city) => {
    const config = fajnFeedConfig(city);
    return { id: `fajn-brigady-${city}`, kind: "jobs" as const, format: "xml" as const, enabled: config.enabled, permissionConfirmed: config.permissionConfirmed, maxCheckIntervalHours: 9 as const, statusReason: config.statusReason, feedUrl: config.feedUrl, async fetchItems() { return []; } };
  });
  return [
    ...fajn,
    configuredProvider("isic", "offers", "json", process.env.ISIC_FEED_ENABLED, process.env.ISIC_FEED_PERMISSION_CONFIRMED, process.env.ISIC_FEED_URL),
  ];
}

export function validateProviderItem(item: ProviderItem) {
  if (!item.externalId || !item.title || !item.sourceUrl.startsWith("https://")) return false;
  const updated = new Date(item.updatedAt).getTime(); const expires = new Date(item.expiresAt).getTime();
  return Number.isFinite(updated) && Number.isFinite(expires) && expires > Date.now();
}
