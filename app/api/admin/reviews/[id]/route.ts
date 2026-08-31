import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { updateRecord } from "@/lib/data-store";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { normalizedEventToRow } from "@/lib/sources/sync";
import type { NormalizedEvent } from "@/lib/sources/types";
import { adminSectionAllowed } from "@/lib/admin-sections";

type Context = { params: Promise<{ id: string }> };

type ReviewDecision = {
  externalId: string;
  title: string;
  status: "approved" | "rejected";
  reviewedBy: string;
  reviewedAt: string;
};

function prepareRowsForApproval(events: NormalizedEvent[]) {
  const unique = new Map<
    string,
    ReturnType<typeof normalizedEventToRow>
  >();

  for (const event of events) {
    const row = normalizedEventToRow(event, true);

    const start = new Date(row.starts_at).getTime();
    const end = row.ends_at
      ? new Date(row.ends_at).getTime()
      : null;

    // Parser může občas vrátit konec před začátkem.
    // Takový konec odstraníme, aby databáze nedostala neplatný interval.
    if (
      row.ends_at &&
      (
        !Number.isFinite(start) ||
        end === null ||
        !Number.isFinite(end) ||
        end < start
      )
    ) {
      row.ends_at = null;
    }

    const key = `${row.source_id}:${row.external_id}`;
    const existing = unique.get(key);

    if (!existing) {
      unique.set(key, row);
      continue;
    }

    // Stejný externalId se může v parseru objevit vícekrát.
    // Do jednoho PostgreSQL upsertu ale musí přijít jen jeden řádek
    // pro stejný conflict key. Zachováme úplnější interval.
    const existingEnd = existing.ends_at
      ? new Date(existing.ends_at).getTime()
      : new Date(existing.starts_at).getTime();

    const candidateEnd = row.ends_at
      ? new Date(row.ends_at).getTime()
      : new Date(row.starts_at).getTime();

    if (candidateEnd >= existingEnd) {
      unique.set(key, row);
    }
  }

  return [...unique.values()];
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;

    const details = ["message", "details", "hint", "code"]
      .map((key) =>
        typeof value[key] === "string" && value[key]
          ? `${key}: ${value[key]}`
          : ""
      )
      .filter(Boolean);

    if (details.length) return details.join("; ");
  }

  return "Rozhodnutí se nepodařilo uložit.";
}

export async function PATCH(request: Request, context: Context) {
  const user = await getAdminUser();

  if (!user) {
    return NextResponse.json(
      { message: "Nepřihlášeno." },
      { status: 401 }
    );
  }
  if (!adminSectionAllowed("source_review_queue", user.role)) return NextResponse.json({ message: "Kontrola změn není pro vaši roli dostupná." }, { status: 403 });

  const body = await request.json() as {
    status?: "approved" | "rejected";
    note?: string;
    events?: NormalizedEvent[];
    eventExternalId?: string;
  };

  if (
    !body.status ||
    !["approved", "rejected"].includes(body.status)
  ) {
    return NextResponse.json(
      { message: "Neplatné rozhodnutí." },
      { status: 422 }
    );
  }

  if (
    body.events &&
    (
      !Array.isArray(body.events) ||
      body.events.some(
        (event) =>
          !event.title?.trim() ||
          Number.isNaN(new Date(event.startAt).getTime()) ||
          event.timezone !== "Europe/Prague" ||
          event.confidence < 0 ||
          event.confidence > 1
      )
    )
  ) {
    return NextResponse.json(
      {
        message:
          "Upravený návrh neprošel serverovou validací.",
      },
      { status: 422 }
    );
  }

  const id = (await context.params).id;

  try {
    if (isSupabaseConfigured()) {
      const client = createServiceClient();

      const { data: review, error } = await client
        .from("source_review_queue")
        .select("*,content_sources(faculty_id,city_id,university_id)")
        .eq("id", id)
        .single();

      if (error) throw error;

      const facultyId =
        (
          review.content_sources as
            | { faculty_id?: string }
            | null
        )?.faculty_id;
      const sourceScope = review.content_sources as { faculty_id?: string | null; city_id?: string | null; university_id?: string | null } | null;

      if (
        user.role === "faculty_editor" &&
        facultyId !== user.facultyId
      ) {
        return NextResponse.json(
          { message: "Změna není v rozsahu editora." },
          { status: 403 }
        );
      }
      if (user.role !== "super_admin" && user.role !== "faculty_editor") {
        let inCity = Boolean(user.cityId && sourceScope?.city_id === user.cityId);
        if (!inCity && user.cityId && sourceScope?.university_id) {
          const { data: cityLink } = await client.from("university_cities").select("university_id").eq("university_id", sourceScope.university_id).eq("city_id", user.cityId).maybeSingle();
          inCity = Boolean(cityLink);
        }
        if (!inCity) return NextResponse.json({ message: "Změna není v rozsahu editora." }, { status: 403 });
      }

      const rawPayload = review.proposed_payload;

      const payload =
        rawPayload &&
        typeof rawPayload === "object" &&
        !Array.isArray(rawPayload)
          ? rawPayload as Record<string, unknown>
          : {};

      const originalEvents =
        (
          payload as {
            events?: NormalizedEvent[];
          }
        ).events || [];

      const events = body.events || originalEvents;

      const eventExternalId =
        body.eventExternalId?.trim() || null;

      const targetEvents = eventExternalId
        ? events.filter(
            (event) =>
              event.externalId === eventExternalId
          )
        : events;

      if (
        eventExternalId &&
        targetEvents.length === 0
      ) {
        return NextResponse.json(
          {
            message:
              "Tento návrh už ve frontě není. Obnovte administraci.",
          },
          { status: 422 }
        );
      }

      if (
        targetEvents.some(
          (event) =>
            event.facultyId !== facultyId ||
            event.sourceId !== review.source_id
        )
      ) {
        return NextResponse.json(
          {
            message:
              "Nelze změnit zdroj ani fakultní rozsah návrhu.",
          },
          { status: 422 }
        );
      }

      const reviewedAt = new Date().toISOString();

      /*
       * INDIVIDUÁLNÍ SCHVÁLENÍ / ZAMÍTNUTÍ
       */
      if (eventExternalId) {
        if (
          body.status === "approved" &&
          targetEvents.length
        ) {
          const publishRows =
            prepareRowsForApproval(targetEvents);

          const { error: publishError } = await client
            .from("academic_events")
            .upsert(publishRows, {
              onConflict: "source_id,external_id",
            });

          if (publishError) throw publishError;
        }

        // Odstraníme všechny parserové duplicity stejného externalId.
        const remainingEvents = events.filter(
          (event) =>
            event.externalId !== eventExternalId
        );

        const existingDecisions = Array.isArray(
          payload.decisions
        )
          ? payload.decisions
          : [];

        const selected = targetEvents[0];

        const decision: ReviewDecision = {
          externalId: eventExternalId,
          title:
            selected?.title ||
            eventExternalId,
          status: body.status,
          reviewedBy: user.id,
          reviewedAt,
        };

        const decisions = [
          ...existingDecisions,
          decision,
        ];

        const allDone =
          remainingEvents.length === 0;

        const anyApproved = decisions.some(
          (item) =>
            item &&
            typeof item === "object" &&
            "status" in item &&
            (item as { status?: unknown }).status ===
              "approved"
        );

        const queueStatus:
          | "pending"
          | "approved"
          | "rejected" = allDone
          ? anyApproved
            ? "approved"
            : "rejected"
          : "pending";

        const proposedPayload = {
          ...payload,
          events: remainingEvents,
          decisions,
        };

        const { data, error: updateError } =
          await client
            .from("source_review_queue")
            .update({
              status: queueStatus,
              proposed_payload: proposedPayload,
              review_note:
                body.note ||
                review.review_note ||
                null,
              reviewed_by:
                queueStatus === "pending"
                  ? null
                  : user.id,
              reviewed_at:
                queueStatus === "pending"
                  ? null
                  : reviewedAt,
            })
            .eq("id", id)
            .select()
            .single();

        if (updateError) throw updateError;

        return NextResponse.json(data);
      }

      /*
       * SCHVÁLIT VŠE
       */
      if (
        body.status === "approved" &&
        events.length
      ) {
        const publishRows =
          prepareRowsForApproval(events);

        const { error: publishError } = await client
          .from("academic_events")
          .upsert(publishRows, {
            onConflict: "source_id,external_id",
          });

        if (publishError) throw publishError;
      }

      const proposedPayload = body.events
        ? {
            ...payload,
            events,
          }
        : review.proposed_payload;

      const { data, error: updateError } =
        await client
          .from("source_review_queue")
          .update({
            status: body.status,
            proposed_payload: proposedPayload,
            review_note: body.note || null,
            reviewed_by: user.id,
            reviewed_at: reviewedAt,
          })
          .eq("id", id)
          .select()
          .single();

      if (updateError) throw updateError;

      return NextResponse.json(data);
    }

    return NextResponse.json(
      await updateRecord(
        "source_review_queue",
        id,
        {
          status: body.status,
          review_note: body.note || null,
          reviewed_at:
            new Date().toISOString(),
        }
      )
    );
  } catch (error) {
    console.error(
      "Admin review decision failed:",
      error
    );

    return NextResponse.json(
      { message: errorMessage(error) },
      { status: 422 }
    );
  }
}
