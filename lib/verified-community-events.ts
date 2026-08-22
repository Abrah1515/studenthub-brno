import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

export type CommunityEventSyncResult = {
  id: string;
  sourceExternalId: string;
  status: "verified" | "needs_review" | "unavailable" | "archived";
  finalUrl?: string;
  contentType?: string;
  message: string;
};

function normalized(value: string) {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase();
}

export function eventSourceContainsTitle(content: string, title: string) {
  const words = normalized(title).split(" ").filter((word) => word.length > 2).slice(0, 5);
  const haystack = normalized(content);
  return words.length >= 2 && words.filter((word) => haystack.includes(word)).length >= Math.min(3, words.length);
}

export function unsafeSourceResponseReason(finalUrl: string, content: string) {
  const path = new URL(finalUrl).pathname.toLowerCase(); const normalizedContent = normalized(content.slice(0, 120_000));
  if (/(?:^|\/)(?:login|sign-in|signin|prihlaseni|turnstile|challenge)(?:\/|\.|$)/.test(path)) return "Zdroj přesměroval na přihlašovací nebo ochrannou stránku.";
  if (/cf turnstile|turnstile challenge|checking your browser|captcha|type password|access denied/.test(normalizedContent)) return "Zdroj vrátil přihlašovací nebo ochrannou stránku.";
  if (content.length < 500) return "Výsledek je příliš krátký pro bezpečné porovnání.";
  if (content.length > 3_000_000) return "Výsledek překročil bezpečný limit a nebyl porovnán celý.";
  return "";
}

async function updateHealth(client: SupabaseClient, id: string, changes: Record<string, unknown>) {
  const { error } = await client.from("community_events").update(changes).eq("id", id).eq("source_type", "external");
  if (error) throw error;
}

async function syncOne(client: SupabaseClient, row: Record<string, unknown>): Promise<CommunityEventSyncResult> {
  const id = String(row.id); const sourceExternalId = String(row.source_external_id); const sourceUrl = String(row.source_url || "");
  const base = { id, sourceExternalId };
  try {
    if (!sourceUrl.startsWith("https://")) throw new Error("Zdroj nemá bezpečnou HTTPS adresu.");
    if (/\.pdf(?:$|\?)/i.test(sourceUrl)) {
      await updateHealth(client, id, { source_sync_status: "needs_review" });
      return { ...base, status: "needs_review", message: "PDF zdroj zůstává v ruční kontrole." };
    }
    const response = await fetch(sourceUrl, { redirect: "follow", cache: "no-store", headers: { accept: "text/html,application/xhtml+xml", "user-agent": "StudentHubBrno/1.0 (+https://studenthub-brno.vercel.app/o-projektu)" }, signal: AbortSignal.timeout(18_000) });
    const finalUrl = response.url; const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || "";
    if (!response.ok) throw new Error(`Zdroj odpověděl HTTP ${response.status}.`);
    if (!finalUrl.startsWith("https://") || !["text/html", "application/xhtml+xml"].includes(contentType)) {
      await updateHealth(client, id, { source_sync_status: "needs_review" });
      return { ...base, status: "needs_review", finalUrl, contentType, message: `Neočekávaný výsledek: ${finalUrl || sourceUrl}, MIME ${contentType || "neuveden"}.` };
    }
    const body = await response.text(); const unsafeReason = unsafeSourceResponseReason(finalUrl, body);
    if (unsafeReason) { await updateHealth(client, id, { source_sync_status: "needs_review" }); return { ...base, status: "needs_review", finalUrl, contentType, message: unsafeReason }; }
    if (!eventSourceContainsTitle(body, String(row.title))) {
      const misses = Number(row.source_miss_count || 0) + 1;
      const archive = misses >= 2;
      await updateHealth(client, id, { source_sync_status: "needs_review", source_miss_count: misses, ...(archive ? { status: "archived", archived_at: new Date().toISOString() } : {}) });
      return { ...base, status: archive ? "archived" : "needs_review", finalUrl, contentType, message: archive ? "Akce po dvou úspěšných kontrolách ve zdroji chybí a byla archivována." : "Akce ve zdroji nebyla jednoznačně nalezena; čeká na další kontrolu." };
    }
    const contentHash = createHash("sha256").update(body).digest("hex");
    const changed = Boolean(row.source_content_hash) && row.source_content_hash !== contentHash;
    await updateHealth(client, id, { source_sync_status: changed ? "needs_review" : "verified", source_miss_count: 0, source_content_hash: contentHash, ...(changed ? {} : { last_verified_at: new Date().toISOString() }) });
    return { ...base, status: changed ? "needs_review" : "verified", finalUrl, contentType, message: changed ? "Veřejný zdroj se změnil; záznam zůstává zveřejněný a čeká na ruční porovnání." : "Zdroj i název akce byly ověřeny." };
  } catch (error) {
    await updateHealth(client, id, { source_sync_status: "unavailable" }).catch(() => undefined);
    return { ...base, status: "unavailable", message: error instanceof Error ? error.message : "Zdroj se nepodařilo ověřit." };
  }
}

export async function syncVerifiedCommunityEvents(): Promise<CommunityEventSyncResult[]> {
  if (!isSupabaseConfigured()) return [];
  const client = createServiceClient(); const now = new Date(); const cutoff = new Date(now.getTime() - 9 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client.from("community_events").select("id,title,source_url,source_external_id,source_miss_count,source_content_hash,status,starts_at,ends_at,updated_at").eq("source_type", "external").in("status", ["published", "archived"]).lt("updated_at", cutoff).or(`ends_at.gte.${now.toISOString()},and(ends_at.is.null,starts_at.gte.${now.toISOString()})`).order("starts_at");
  if (error) throw error;
  return Promise.all((data || []).map((row) => syncOne(client, row)));
}
