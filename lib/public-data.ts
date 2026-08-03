import "server-only";
import { unstable_noStore as noStore } from "next/cache";
import type { AcademicEvent, Job, Offer, Place } from "@/lib/types";
import { facultyById, universityById } from "@/lib/universities";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { verifiedFallbackData } from "@/lib/verified-data";
import { defaultCitySlug } from "@/lib/cities";
import { academicEventMatchesSelection, type StudySelection } from "@/lib/academic-events";

function fallbackAllowed() { return process.env.NODE_ENV !== "production" || process.env.ALLOW_VERIFIED_FALLBACK === "true"; }
const eventCategories: Record<string, AcademicEvent["category"]> = { semester_start: "Začátek semestru", semester_end: "Konec semestru", teaching: "Výuka", course_registration: "Registrace předmětů", course_enrollment: "Zápis předmětů", enrollment_changes: "Změny zápisu", timetable_release: "Zveřejnění rozvrhu", exam: "Zkouškové období", holiday: "Prázdniny", final_exam: "Státní závěrečné zkoušky", thesis_deadline: "Odevzdání závěrečných prací", matriculation: "Imatrikulace", graduation: "Promoce", internship: "Praxe", faculty_event: "Fakultní akce", registration: "Registrace předmětů", other: "Ostatní" };
const placeCategories: Record<string, Place["category"]> = { study_room: "Studovna", library: "Knihovna", canteen: "Menza", print: "Tisk", cafe: "Kavárna", sport: "Sport", service: "Servis", other: "Ostatní" };

function eventFromRow(row: Record<string, unknown>): AcademicEvent {
  const universityId = row.university_id ? String(row.university_id) : undefined;
  const facultyId = row.faculty_id ? String(row.faculty_id) : undefined;
  return { id: String(row.id), externalId: row.external_id ? String(row.external_id) : undefined, title: String(row.title), description: String(row.description || ""), category: eventCategories[String(row.category)] || "Ostatní", school: universityById(universityId)?.shortName || String(row.school || "Městská událost"), faculty: facultyById(facultyId)?.shortName || String(row.faculty || "Všechny fakulty"), start: String(row.starts_at), end: row.ends_at ? String(row.ends_at) : undefined, allDay: Boolean(row.all_day), timezone: String(row.timezone || "Europe/Prague"), academicYear: row.academic_year ? String(row.academic_year) : undefined, source: String(row.source_name || "Veřejný zdroj"), sourceId: row.source_id ? String(row.source_id) : undefined, sourceUrl: String(row.source_url || ""), sourceDocumentTitle: row.source_document_title ? String(row.source_document_title) : undefined, sourceUpdatedAt: row.source_updated_at ? String(row.source_updated_at) : undefined, updatedAt: String(row.updated_at || row.source_updated_at || row.last_verified_at), lastVerifiedAt: String(row.last_verified_at || row.source_updated_at || row.updated_at), confidence: row.confidence == null ? undefined : Number(row.confidence), status: String(row.status || "approved") as AcademicEvent["status"], changeState: Boolean(row.is_cancelled) ? "cancelled" : String(row.change_state || "unchanged") as AcademicEvent["changeState"], scope: String(row.scope_type || "city") as AcademicEvent["scope"], cityId: row.city_id ? String(row.city_id) : undefined, universityId, facultyId, programmeId: row.programme_id ? String(row.programme_id) : undefined, campusId: row.campus_id ? String(row.campus_id) : undefined };
}

function placeFromRow(row: Record<string, unknown>): Place {
  return { id: String(row.id), cityId: String(row.city_id), campusId: row.campus_id ? String(row.campus_id) : undefined, name: String(row.name), category: placeCategories[String(row.category)] || "Ostatní", address: String(row.address), hours: row.opening_hours ? String(row.opening_hours) : undefined, website: String(row.website_url || row.source_url), sourceUrl: String(row.source_url || row.website_url), lastVerifiedAt: String(row.last_verified_at || row.updated_at), verificationStatus: String(row.verification_status || "needs_review") as Place["verificationStatus"], osmId: row.osm_id ? String(row.osm_id) : undefined, lat: Number(row.latitude), lng: Number(row.longitude), note: String(row.description || ""), universityIds: row.university_id ? [String(row.university_id)] : undefined, facultyIds: row.faculty_id ? [String(row.faculty_id)] : undefined, campus: row.campus_name ? String(row.campus_name) : undefined };
}

function offerFromRow(row: Record<string, unknown>): Offer {
  const cities = row.offer_cities as Array<{ city_id?: string }> | undefined;
  return { id: String(row.id), cityIds: cities?.map((item) => String(item.city_id)), campusId: row.campus_id ? String(row.campus_id) : undefined, title: String(row.title), category: String(row.category) as Offer["category"], partner: String(row.partner_name), discount: String(row.discount_label || "Studentská nabídka"), validTo: String(row.valid_to), conditions: String(row.conditions), url: String(row.destination_url), sourceUrl: String(row.source_url), lastVerifiedAt: String(row.last_verified_at || row.updated_at), requiresIsic: Boolean(row.requires_isic), sponsored: Boolean(row.is_sponsored), affiliate: Boolean(row.is_affiliate), featured: Boolean(row.is_featured), universityIds: row.university_id ? [String(row.university_id)] : undefined, facultyIds: row.faculty_id ? [String(row.faculty_id)] : undefined, campus: row.campus_name ? String(row.campus_name) : undefined, lat: row.latitude == null ? undefined : Number(row.latitude), lng: row.longitude == null ? undefined : Number(row.longitude) };
}

function jobFromRow(row: Record<string, unknown>): Job {
  return { id: String(row.id), cityId: row.city_id ? String(row.city_id) : undefined, locationMode: String(row.work_location_mode || "onsite") as Job["locationMode"], title: String(row.title), company: String(row.company_name), field: String(row.field) as Job["field"], type: String(row.work_type) as Job["type"], location: String(row.location), reward: Number(row.reward_amount), workload: String(row.workload), contact: row.contact_public ? String(row.contact_public) : undefined, applyUrl: row.apply_url ? String(row.apply_url) : undefined, sourceUrl: row.source_url ? String(row.source_url) : undefined, lastVerifiedAt: String(row.last_verified_at || row.updated_at), validTo: row.expires_at ? String(row.expires_at) : undefined, description: String(row.description), featured: Boolean(row.is_featured), status: String(row.status) as Job["status"], universityIds: row.university_id ? [String(row.university_id)] : undefined, facultyIds: row.faculty_id ? [String(row.faculty_id)] : undefined };
}

async function universityIdsForCity(cityId: string) {
  const { data, error } = await createServiceClient().from("university_cities").select("university_id").eq("city_id", cityId);
  if (error) throw error;
  return (data || []).map((item) => String(item.university_id));
}

async function publicRows(table: "academic_events" | "places" | "offers" | "jobs", cityId: string) {
  if (!isSupabaseConfigured()) return null;
  const client = createServiceClient();
  if (table === "academic_events") {
    const ids = await universityIdsForCity(cityId);
    const audience = [`city_id.eq.${cityId}`, "and(city_id.is.null,scope_type.eq.national)", ...(ids.length ? [`and(city_id.is.null,university_id.in.(${ids.join(",")}))`] : [])].join(",");
    const { data, error } = await client.from(table).select("*").eq("status", "approved").eq("is_demo", false).eq("verification_status", "verified").eq("is_cancelled", false).or(audience).order("starts_at");
    if (error) throw error; return data as Record<string, unknown>[];
  }
  if (table === "offers") {
    const { data, error } = await client.from(table).select("*,offer_cities!inner(city_id)").eq("status", "approved").eq("is_demo", false).eq("verification_status", "verified").eq("offer_cities.city_id", cityId).gte("valid_to", new Date().toISOString().slice(0, 10)).order("is_featured", { ascending: false });
    if (error) throw error; return data as Record<string, unknown>[];
  }
  if (table === "jobs") {
    const { data, error } = await client.from(table).select("*").eq("status", "approved").eq("is_demo", false).eq("verification_status", "verified").or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`).or(`city_id.eq.${cityId},work_location_mode.eq.remote`).order("is_featured", { ascending: false });
    if (error) throw error; return data as Record<string, unknown>[];
  }
  const { data, error } = await client.from(table).select("*").eq("status", "approved").eq("is_demo", false).eq("verification_status", "verified").eq("city_id", cityId).order("name");
  if (error) throw error; return data as Record<string, unknown>[];
}

export async function getAcademicEvents(cityId = defaultCitySlug, selection: StudySelection = {}) { noStore(); const rows = await publicRows("academic_events", cityId); const events = rows ? rows.map(eventFromRow) : fallbackAllowed() && cityId === "brno" ? verifiedFallbackData.academic_events : []; return events.filter((event) => academicEventMatchesSelection(event, selection)); }
export async function getPlaces(cityId = defaultCitySlug) { noStore(); const rows = await publicRows("places", cityId); return rows ? rows.map(placeFromRow) : fallbackAllowed() && cityId === "brno" ? verifiedFallbackData.places : []; }
export async function getOffers(cityId = defaultCitySlug) { noStore(); const rows = await publicRows("offers", cityId); return rows ? rows.map(offerFromRow) : fallbackAllowed() && cityId === "brno" ? verifiedFallbackData.offers.filter((item) => !item.cityIds?.length || item.cityIds.includes(cityId)) : []; }
export async function getJobs(cityId = defaultCitySlug) { noStore(); const rows = await publicRows("jobs", cityId); return rows ? rows.map(jobFromRow) : fallbackAllowed() && cityId === "brno" ? verifiedFallbackData.jobs.filter((item) => item.locationMode === "remote" || item.cityId === cityId) : []; }
