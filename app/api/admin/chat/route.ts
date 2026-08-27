import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin-auth";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

const actionSchema = z.object({ reportId: z.string().uuid(), action: z.enum(["dismiss_report", "hide_message", "restrict_chat", "suspend_profile", "restore_message", "restore_chat"]), reason: z.string().trim().min(3).max(1000) });

async function authorized() {
  const admin = await getAdminUser();
  if (!admin) return { response: NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 }) };
  if (admin.role === "faculty_editor") return { response: NextResponse.json({ message: "Fakultní editor nemá přístup k soukromým hlášením." }, { status: 403 }) };
  if (!isSupabaseConfigured()) return { response: NextResponse.json({ message: "Moderace chatu vyžaduje produkční databázi." }, { status: 503 }) };
  return { admin, service: createServiceClient() };
}

export async function GET() {
  const scope = await authorized(); if ("response" in scope) return scope.response; const { service } = scope;
  const [{ data: reports }, { count: requested }, { count: active }, { count: totalReports }, { data: actions }] = await Promise.all([
    service.from("chat_message_reports").select("*").order("created_at", { ascending: false }).limit(100),
    service.from("chat_conversations").select("id", { count: "exact", head: true }).eq("status", "requested"),
    service.from("chat_conversations").select("id", { count: "exact", head: true }).eq("status", "active"),
    service.from("chat_message_reports").select("id", { count: "exact", head: true }),
    service.from("chat_moderation_actions").select("*").order("created_at", { ascending: false }).limit(100),
  ]);
  const items = await Promise.all((reports || []).map(async (report) => {
    const { data: message } = await service.from("chat_messages").select("id,conversation_id,sender_id,body,status,created_at").eq("id", report.message_id).maybeSingle();
    if (!message) return { ...report, message: null, context: [] };
    const { data: context } = await service.from("chat_messages").select("id,sender_id,body,status,created_at").eq("conversation_id", message.conversation_id).order("created_at", { ascending: false }).limit(5);
    return { ...report, message, context: (context || []).reverse() };
  }));
  return NextResponse.json({ statistics: { requested: requested || 0, active: active || 0, reports: totalReports || 0 }, items, actions: actions || [] }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const scope = await authorized(); if ("response" in scope) return scope.response; const { admin, service } = scope;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte moderátorskou akci a interní důvod." }, { status: 422 });
  const { data: report } = await service.from("chat_message_reports").select("*").eq("id", parsed.data.reportId).maybeSingle(); if (!report) return NextResponse.json({ message: "Hlášení nebylo nalezeno." }, { status: 404 });
  const { data: message } = await service.from("chat_messages").select("id,conversation_id,sender_id,status").eq("id", report.message_id).maybeSingle(); if (!message) return NextResponse.json({ message: "Nahlášená zpráva nebyla nalezena." }, { status: 404 });
  const { data: conversation } = await service.from("chat_conversations").select("status,status_before_restriction").eq("id", message.conversation_id).maybeSingle();
  if (!conversation) return NextResponse.json({ message: "Konverzace nebyla nalezena." }, { status: 404 });
  const action = parsed.data.action; const now = new Date().toISOString(); let error: { message: string } | null = null;
  if (action === "dismiss_report") error = (await service.from("chat_message_reports").update({ status: "dismissed", reviewed_by: admin.id, reviewed_at: now }).eq("id", report.id)).error;
  else if (action === "hide_message" || action === "restore_message") error = (await service.from("chat_messages").update({ status: action === "hide_message" ? "hidden" : "active", hidden_at: action === "hide_message" ? now : null }).eq("id", message.id)).error;
  else if (action === "restrict_chat" || action === "restore_chat") {
    const previousStatus = ["requested", "active"].includes(String(conversation.status)) ? conversation.status : conversation.status_before_restriction;
    error = (await service.from("chat_conversations").update(action === "restrict_chat" ? { status_before_restriction: previousStatus || "active", status: "restricted", restricted_at: now, restricted_reason: parsed.data.reason, updated_at: now } : { status: conversation.status_before_restriction || "active", status_before_restriction: null, restricted_at: null, restricted_reason: null, updated_at: now }).eq("id", message.conversation_id)).error;
  }
  else if (action === "suspend_profile") {
    error = (await service.from("profiles").update({ account_status: "suspended", is_blocked: true, suspended_at: now, suspension_reason: parsed.data.reason }).eq("id", message.sender_id)).error;
    if (!error) await service.from("account_moderation_history").insert({ profile_id: message.sender_id, actor_id: admin.id, action: "suspended", reason: parsed.data.reason, snapshot: { source: "chat_report", report_id: report.id } });
  }
  if (error) return NextResponse.json({ message: "Moderátorskou akci se nepodařilo uložit." }, { status: 422 });
  if (action !== "dismiss_report") await service.from("chat_message_reports").update({ status: "actioned", reviewed_by: admin.id, reviewed_at: now }).eq("id", report.id);
  await service.from("chat_moderation_actions").insert({ actor_id: admin.id, report_id: report.id, conversation_id: message.conversation_id, message_id: message.id, target_profile_id: action === "suspend_profile" ? message.sender_id : null, action, reason: parsed.data.reason, snapshot: { previous_message_status: message.status, previous_report_status: report.status, previous_conversation_status: conversation.status, previous_status_before_restriction: conversation.status_before_restriction } });
  return NextResponse.json({ message: "Moderátorská akce byla uložena do auditu." });
}
