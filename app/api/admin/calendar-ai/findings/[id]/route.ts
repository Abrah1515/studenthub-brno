import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase-server";

const bodySchema = z.object({ status: z.enum(["new", "needs_review", "confirmed_correct", "approved_fix", "rejected", "resolved", "cannot_verify"]), resolutionNote: z.string().max(2000).optional() });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAdminUser();
  if (!user || !["super_admin", "admin"].includes(user.role) || (user.role !== "super_admin" && user.cityId !== "brno")) return NextResponse.json({ message: "Nemáte oprávnění." }, { status: 403 });
  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Neplatný stav nálezu." }, { status: 400 });
  const client = createServiceClient();
  const { data: finding } = await client.from("academic_calendar_ai_findings").select("id,city_id,faculty_id,academic_event_id,discovered_value,status").eq("id", id).single();
  if (!finding) return NextResponse.json({ message: "Nález nebyl nalezen." }, { status: 404 });
  const allowed = finding.city_id === "brno" && (user.role === "super_admin" || finding.city_id === user.cityId);
  if (!allowed) return NextResponse.json({ message: "Nález není v rozsahu vašeho oprávnění." }, { status: 403 });
  if (parsed.data.status === "approved_fix") {
    if (!finding.academic_event_id) return NextResponse.json({ message: "Nový termín je nutné nejprve ručně vložit v administraci." }, { status: 409 });
    const { data: event } = await client.from("academic_events").select("title,starts_at,ends_at,category,semester,study_years,university_id,faculty_id,source_url").eq("id", finding.academic_event_id).single();
    const proposed = finding.discovered_value as Record<string, unknown>;
    const sameDate = (a: unknown, b: unknown) => (!a && !b) || Boolean(a && b && Number.isFinite(Date.parse(String(a))) && Date.parse(String(a)) === Date.parse(String(b)));
    const sameYears = (a: unknown, b: unknown) => JSON.stringify(a || null) === JSON.stringify(b || null);
    if (!event || !sameDate(event.starts_at, proposed.startsAt) || !sameDate(event.ends_at, proposed.endsAt) || String(event.title) !== String(proposed.title) || String(event.category) !== String(proposed.category) || String(event.semester || "") !== String(proposed.semester || "") || !sameYears(event.study_years, proposed.studyYears) || String(event.university_id || "") !== String(proposed.universityId || "") || String(event.faculty_id || "") !== String(proposed.facultyId || "") || String(event.source_url || "") !== String(proposed.sourceUrl || "")) return NextResponse.json({ message: "Termín zatím neodpovídá nálezu. Nejprve jej ručně upravte v administraci." }, { status: 409 });
  }
  const { data, error } = await client.from("academic_calendar_ai_findings").update({ status: parsed.data.status, resolution_note: parsed.data.resolutionNote || null, resolved_by: user.id, resolved_at: ["new", "needs_review", "cannot_verify"].includes(parsed.data.status) ? null : new Date().toISOString() }).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ message: "Nález se nepodařilo uložit." }, { status: 500 });
  return NextResponse.json({ finding: data });
}
