import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { deleteRecord, insertRecord, listRecords, updateRecord, type TableName } from "@/lib/data-store";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

const allowed = new Set<TableName>(["cities", "academic_events", "places", "offers", "jobs", "submissions", "service_requests", "buddy_posts", "content_reports"]);
type Context = { params: Promise<{ resource: string }> };
type AdminUser = NonNullable<Awaited<ReturnType<typeof getAdminUser>>>;
async function table(context: Context) { const value = (await context.params).resource as TableName; return allowed.has(value) ? value : null; }

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
  return false;
}

export async function POST(request: Request, context: Context) {
  const user = await getAdminUser(); if (!user) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  const resource = await table(context); if (!resource) return NextResponse.json({ message: "Neplatný typ." }, { status: 404 });
  if (resource === "cities" && user.role !== "super_admin") return NextResponse.json({ message: "Nové město může založit pouze super administrátor." }, { status: 403 });
  if (user.role === "faculty_editor" && !user.facultyId) return NextResponse.json({ message: "Editor nemá přiřazenou fakultu." }, { status: 403 });
  const body = await request.json();
  const localResource = ["places", "jobs", "submissions", "service_requests", "buddy_posts", "content_reports"].includes(resource);
  if (localResource && user.role !== "super_admin" && !user.cityId) return NextResponse.json({ message: "Editor nemá přiřazené město." }, { status: 403 });
  const saved = await insertRecord(resource, { ...body, ...(localResource ? { city_id: user.cityId } : {}), faculty_id: user.role === "faculty_editor" ? user.facultyId : body.faculty_id, status: body.status || "pending", ...(resource === "cities" ? {} : { is_demo: false }) });
  if (resource === "offers" && isSupabaseConfigured() && user.cityId) await createServiceClient().from("offer_cities").upsert({ offer_id: saved.id, city_id: user.cityId });
  return NextResponse.json(saved, { status: 201 });
}

export async function PATCH(request: Request, context: Context) {
  const user = await getAdminUser(); if (!user) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  const resource = await table(context); if (!resource) return NextResponse.json({ message: "Neplatný typ." }, { status: 404 });
  const body = await request.json(); if (!body.id) return NextResponse.json({ message: "Chybí ID." }, { status: 422 });
  if (!await canEdit(resource, String(body.id), user)) return NextResponse.json({ message: "Záznam není v rozsahu editora." }, { status: 403 });
  const { id, ...changes } = body;
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
