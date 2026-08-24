import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin-auth";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

const schema = z.object({ profileId: z.string().uuid(), action: z.enum(["suspend", "restore", "dismiss_report"]), reason: z.string().trim().min(2).max(800), reportId: z.string().uuid().optional() });

export async function PATCH(request: Request) {
  const admin = await getAdminUser(); if (admin?.role !== "super_admin") return NextResponse.json({ message: "Pouze hlavní superadministrátor." }, { status: 403 });
  if (!isSupabaseConfigured()) return NextResponse.json({ message: "Správa profilů vyžaduje Supabase." }, { status: 503 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte moderátorský zásah." }, { status: 422 });
  const value = parsed.data; const client = createServiceClient(); const { data: current } = await client.from("profiles").select("id,username,display_name,account_status,profile_visibility,is_blocked").eq("id", value.profileId).maybeSingle(); if (!current) return NextResponse.json({ message: "Profil nebyl nalezen." }, { status: 404 });
  if (value.action === "dismiss_report") { if (!value.reportId) return NextResponse.json({ message: "Chybí hlášení." }, { status: 422 }); const { error } = await client.from("profile_reports").update({ status: "dismissed", reviewed_at: new Date().toISOString() }).eq("id", value.reportId).eq("reported_id", value.profileId); if (error) return NextResponse.json({ message: "Hlášení se nepodařilo uzavřít." }, { status: 422 }); }
  else { const suspended = value.action === "suspend"; const { error } = await client.from("profiles").update({ account_status: suspended ? "suspended" : "active", is_blocked: suspended, suspended_at: suspended ? new Date().toISOString() : null, suspension_reason: suspended ? value.reason : null }).eq("id", value.profileId); if (error) return NextResponse.json({ message: "Stav účtu se nepodařilo změnit." }, { status: 422 }); await client.from("community_profiles").update({ status: suspended ? "blocked" : "active" }).eq("user_id", value.profileId); }
  await client.from("account_moderation_history").insert({ profile_id: value.profileId, actor_id: admin.id, action: value.action === "suspend" ? "suspended" : value.action === "restore" ? "restored" : "report_dismissed", reason: value.reason, snapshot: { username: current.username, display_name: current.display_name, previous_status: current.account_status, report_id: value.reportId || null } });
  return NextResponse.json({ message: value.action === "suspend" ? "Účet byl pozastaven." : value.action === "restore" ? "Účet byl obnoven." : "Hlášení bylo uzavřeno." });
}
