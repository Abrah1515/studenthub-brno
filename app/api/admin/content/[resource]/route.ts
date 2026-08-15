import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { deleteRecord, insertRecord, listRecords, updateRecord, type TableName } from "@/lib/data-store";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

const allowed = new Set<TableName>(["cities", "academic_events", "community_events", "places", "offers", "jobs", "submissions", "service_requests", "buddy_posts", "content_reports", "contact_messages", "academic_event_conflicts"]);
const mutableFields: Partial<Record<TableName, ReadonlySet<string>>> = {
  cities: new Set(["name", "region", "latitude", "longitude", "map_bounds", "map_zoom", "enabled", "public_status", "sort_order", "brand_config"]),
  academic_events: new Set(["title", "description", "category", "school", "faculty", "starts_at", "ends_at", "source_name", "source_url", "source_updated_at", "status", "city_id", "university_id", "faculty_id", "scope_type", "academic_year", "study_years"]),
  community_events: new Set(["title", "category", "starts_at", "ends_at", "venue", "description", "is_free", "price_amount", "event_url", "status"]),
  places: new Set(["name", "category", "description", "address", "latitude", "longitude", "opening_hours", "website_url", "status", "city_id", "university_id", "faculty_id", "campus_id", "campus_name", "verification_status"]),
  offers: new Set(["title", "description", "category", "partner_name", "discount_label", "conditions", "destination_url", "valid_from", "valid_to", "is_featured", "is_sponsored", "is_affiliate", "status", "university_id", "faculty_id", "campus_id", "verification_status"]),
  jobs: new Set(["title", "company_name", "field", "work_type", "work_location_mode", "location", "reward_amount", "reward_min", "reward_max", "reward_currency", "reward_unit", "reward_period", "workload", "description", "contact_public", "apply_url", "is_featured", "status", "city_id", "university_id", "faculty_id", "verification_status", "expires_at"]),
  submissions: new Set(["status", "moderation_note", "moderated_by", "moderated_at"]),
  service_requests: new Set(["status", "internal_note", "moderation_status"]),
  buddy_posts: new Set(["moderation_status", "status", "expires_at"]),
  content_reports: new Set(["status", "resolution", "reviewed_by", "reviewed_at", "hideTarget", "blockAuthor"]),
  contact_messages: new Set(["status", "internal_note"]),
  academic_event_conflicts: new Set(["status", "resolution_note", "resolved_by", "resolved_at"]),
};
type Context = { params: Promise<{ resource: string }> };
type AdminUser = NonNullable<Awaited<ReturnType<typeof getAdminUser>>>;
async function table(context: Context) { const value = (await context.params).resource as TableName; return allowed.has(value) ? value : null; }
function permitted(resource: TableName, input: Record<string, unknown>): Record<string, unknown> { const keys = mutableFields[resource] || new Set<string>(); return Object.fromEntries(Object.entries(input).filter(([key]) => keys.has(key))); }

async function canEdit(resource: TableName, id: string, user: AdminUser) {
  if (user.role === "super_admin") return true;
  const row = (await listRecords(resource)).find((item) => String(item.id) === id);
  if (user.role === "faculty_editor") return Boolean(user.facultyId) && (row?.faculty_id === user.facultyId || (row?.content as Record<string, unknown> | undefined)?.facultyId === user.facultyId);
  if (!user.cityId) return false;
  if (resource === "cities") return id === user.cityId && user.role === "admin";
  if (row?.city_id === user.cityId || (row?.content as Record<string, unknown> | undefined)?.cityId === user.cityId) return true;
  if (!isSupabaseConfigured()) return user.mode === "local" && user.cityId === "brno";
  const client = createServiceClient();
  if (resource === "offers") { const { data } = await client.from("offer_cities").select("offer_id").eq("offer_id", id).eq("city_id", user.cityId).maybeSingle(); return Boolean(data); }
  if (resource === "academic_events" && row?.university_id) { const { data } = await client.from("university_cities").select("university_id").eq("university_id", row.university_id).eq("city_id", user.cityId).maybeSingle(); return Boolean(data); }
  if (resource === "academic_event_conflicts" && row?.source_id) { const { data: source } = await client.from("content_sources").select("city_id,university_id").eq("id", row.source_id).maybeSingle(); if (source?.city_id === user.cityId) return true; if (source?.university_id) { const { data } = await client.from("university_cities").select("university_id").eq("university_id", source.university_id).eq("city_id", user.cityId).maybeSingle(); return Boolean(data); } }
  return false;
}

export async function POST(request: Request, context: Context) {
  const user = await getAdminUser(); if (!user) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  const resource = await table(context); if (!resource) return NextResponse.json({ message: "Neplatný typ." }, { status: 404 });
  if (resource === "cities" && user.role !== "super_admin") return NextResponse.json({ message: "Nové město může založit pouze super administrátor." }, { status: 403 });
  if (user.role === "faculty_editor" && !user.facultyId) return NextResponse.json({ message: "Editor nemá přiřazenou fakultu." }, { status: 403 });
  const body = permitted(resource, await request.json() as Record<string, unknown>);
  const localResource = ["community_events", "places", "jobs", "submissions", "service_requests", "buddy_posts", "content_reports"].includes(resource);
  if (localResource && user.role !== "super_admin" && !user.cityId) return NextResponse.json({ message: "Editor nemá přiřazené město." }, { status: 403 });
  const saved = await insertRecord(resource, { ...body, ...(localResource ? { city_id: user.cityId } : {}), faculty_id: user.role === "faculty_editor" ? user.facultyId : body.faculty_id, status: body.status || "pending", ...(resource === "cities" ? {} : { is_demo: false }) });
  if (resource === "offers" && isSupabaseConfigured() && user.cityId) await createServiceClient().from("offer_cities").upsert({ offer_id: saved.id, city_id: user.cityId });
  return NextResponse.json(saved, { status: 201 });
}

export async function PATCH(request: Request, context: Context) {
  const user = await getAdminUser(); if (!user) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  const resource = await table(context); if (!resource) return NextResponse.json({ message: "Neplatný typ." }, { status: 404 });
  const input = await request.json() as Record<string, unknown>; if (!input.id) return NextResponse.json({ message: "Chybí ID." }, { status: 422 });
  const body: Record<string, unknown> = { id: input.id, ...permitted(resource, input) };
  if (!await canEdit(resource, String(body.id), user)) return NextResponse.json({ message: "Záznam není v rozsahu editora." }, { status: 403 });
  const { id, ...changes } = body;
  if (resource === "content_reports" && (body.hideTarget || body.blockAuthor)) {
    const report = (await listRecords("content_reports")).find((row) => String(row.id) === String(body.id));
    if (!report) return NextResponse.json({ message: "Hlášení nebylo nalezeno." }, { status: 404 });
    const targetTable = report.target_type === "buddy_post" ? "buddy_posts" : report.target_type === "community_event" ? "community_events" : "service_requests";
    const target = (await listRecords(targetTable)).find((row) => String(row.id) === String(report.target_id));
    if (body.hideTarget && target) await updateRecord(targetTable, String(target.id), targetTable === "community_events" ? { status: "hidden" } : { moderation_status: "hidden" });
    if (body.blockAuthor && target?.owner_id && isSupabaseConfigured()) await createServiceClient().from("profiles").update({ is_blocked: true }).eq("id", target.owner_id);
    changes.status = "actioned"; changes.reviewed_by = user.id === "local-admin" ? null : user.id; changes.reviewed_at = new Date().toISOString(); changes.resolution = body.blockAuthor ? "Obsah skryt a autor zablokován." : "Obsah skryt.";
    delete changes.hideTarget; delete changes.blockAuthor;
  }
  if (resource === "cities" && user.role !== "super_admin") { delete changes.slug; delete changes.enabled; delete changes.public_status; }
  return NextResponse.json(await updateRecord(resource, String(id), changes));
}

export async function DELETE(request: Request, context: Context) {
  const user = await getAdminUser(); if (!user) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  const resource = await table(context); if (!resource) return NextResponse.json({ message: "Neplatný typ." }, { status: 404 });
  const id = new URL(request.url).searchParams.get("id"); if (!id) return NextResponse.json({ message: "Chybí ID." }, { status: 422 });
  if (resource === "cities") return NextResponse.json({ message: "Města se archivují, nemažou." }, { status: 409 });
  if (!await canEdit(resource, id, user)) return NextResponse.json({ message: "Záznam není v rozsahu editora." }, { status: 403 });
  await deleteRecord(resource, id); return new NextResponse(null, { status: 204 });
}
