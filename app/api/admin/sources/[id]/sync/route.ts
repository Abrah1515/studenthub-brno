import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { sourceById } from "@/lib/sources/registry";
import { syncSource } from "@/lib/sources/sync";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

type Context = { params: Promise<{ id: string }> };
export async function POST(_: Request, context: Context) {
  const user = await getAdminUser(); if (!user) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  if (user.role !== "super_admin") return NextResponse.json({ message: "Ruční synchronizaci může spustit pouze hlavní administrátor." }, { status: 403 });
  const id = (await context.params).id; const source = sourceById(id);
  if (!source && isSupabaseConfigured()) {
    const client = createServiceClient();
    const { data: stored } = await client.from("content_sources").select("id,source_url,enabled,city_id,cities!inner(enabled,public_status)").eq("id", id).maybeSingle();
    const city = stored?.cities as unknown as { enabled?: boolean; public_status?: string } | null;
    if (!stored) return NextResponse.json({ message: "Zdroj nebyl nalezen." }, { status: 404 });
    if (!stored.city_id || city?.enabled || city?.public_status === "published") return NextResponse.json({ message: "Neregistrovaný zdroj lze bezpečně ověřit pouze v neveřejné městské edici." }, { status: 409 });
    if (!stored.enabled) return NextResponse.json({ message: "Monitoring zdroje je administrátorem vypnutý." }, { status: 409 });
    const startedAt = new Date().toISOString(); const run = await client.from("source_sync_runs").insert({ source_id: id, city_id: stored.city_id, status: "running", trigger_type: "manual", triggered_by: user.id, started_at: startedAt }).select("id").single();
    if (run.error || !run.data) return NextResponse.json({ message: "Kontrolní běh se nepodařilo založit." }, { status: 422 });
    try {
      const response = await fetch(String(stored.source_url), { redirect: "follow", headers: { "User-Agent": process.env.SYNC_USER_AGENT || "StudentHub-source-monitor/1.0" }, signal: AbortSignal.timeout(15_000) });
      const contentType = response.headers.get("content-type") || ""; const ok = response.ok && /^(text\/html|application\/(json|xml)|text\/xml)/i.test(contentType);
      await client.from("source_sync_runs").update({ status: ok ? "success" : "review", finished_at: new Date().toISOString(), http_status: response.status, error_message: ok ? null : `Neočekávaná odpověď ${response.status} (${contentType || "bez MIME"}).` }).eq("id", run.data.id);
      await client.from("content_sources").update({ last_checked_at: new Date().toISOString(), ...(ok ? { last_success_at: new Date().toISOString() } : {}), last_http_status: response.status, sync_status: ok ? "success" : "manual_review" }).eq("id", id);
      return NextResponse.json({ sourceId: id, status: ok ? "success" : "review", probeOnly: true, finalUrl: response.url, contentType, publishedCount: 0 });
    } catch (error) {
      await client.from("source_sync_runs").update({ status: "failed", finished_at: new Date().toISOString(), error_message: error instanceof Error ? error.message.slice(0, 500) : "Síťová kontrola selhala." }).eq("id", run.data.id);
      return NextResponse.json({ message: "Bezpečná kontrola zdroje selhala; žádný obsah nebyl změněn." }, { status: 422 });
    }
  }
  if (!source) return NextResponse.json({ message: "Zdroj nebyl nalezen." }, { status: 404 });
  try { return NextResponse.json(await syncSource(source.id, user.cityId || undefined)); } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Synchronizace selhala." }, { status: 422 }); }
}
