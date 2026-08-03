import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { updateRecord } from "@/lib/data-store";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { normalizedEventToRow } from "@/lib/sources/sync";
import type { NormalizedEvent } from "@/lib/sources/types";

type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  const user = await getAdminUser(); if (!user) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  const body = await request.json() as { status?: "approved" | "rejected"; note?: string; events?: NormalizedEvent[] };
  if (!body.status || !["approved", "rejected"].includes(body.status)) return NextResponse.json({ message: "Neplatné rozhodnutí." }, { status: 422 });
  if (body.events && (!Array.isArray(body.events) || body.events.some((event) => !event.title?.trim() || Number.isNaN(new Date(event.startAt).getTime()) || event.timezone !== "Europe/Prague" || event.confidence < 0 || event.confidence > 1))) return NextResponse.json({ message: "Upravený návrh neprošel serverovou validací." }, { status: 422 });
  const id = (await context.params).id;
  try {
    if (isSupabaseConfigured()) {
      const client = createServiceClient(); const { data: review, error } = await client.from("source_review_queue").select("*,content_sources(faculty_id)").eq("id", id).single(); if (error) throw error;
      const facultyId = (review.content_sources as { faculty_id?: string } | null)?.faculty_id; if (user.role === "faculty_editor" && facultyId !== user.facultyId) return NextResponse.json({ message: "Změna není v rozsahu editora." }, { status: 403 });
      const originalEvents = ((review.proposed_payload as { events?: NormalizedEvent[] })?.events || []); const events = body.events || originalEvents;
      if (events.some((event) => event.facultyId !== facultyId || event.sourceId !== review.source_id)) return NextResponse.json({ message: "Nelze změnit zdroj ani fakultní rozsah návrhu." }, { status: 422 });
      if (body.status === "approved" && events.length) { const { error: publishError } = await client.from("academic_events").upsert(events.map((event) => normalizedEventToRow(event, true)), { onConflict: "source_id,external_id" }); if (publishError) throw publishError; }
      const proposedPayload = body.events ? { ...(review.proposed_payload as Record<string, unknown>), events } : review.proposed_payload;
      const { data, error: updateError } = await client.from("source_review_queue").update({ status: body.status, proposed_payload: proposedPayload, review_note: body.note || null, reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq("id", id).select().single(); if (updateError) throw updateError; return NextResponse.json(data);
    }
    return NextResponse.json(await updateRecord("source_review_queue", id, { status: body.status, review_note: body.note || null, reviewed_at: new Date().toISOString() }));
  } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Rozhodnutí se nepodařilo uložit." }, { status: 422 }); }
}
