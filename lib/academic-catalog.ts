import "server-only";

import { unstable_noStore as noStore } from "next/cache";
import type { AcademicCatalog, Faculty, University } from "@/lib/types";
import { fallbackAcademicCatalog } from "@/lib/universities";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

export async function getAcademicCatalog(): Promise<AcademicCatalog> {
  noStore();
  if (!isSupabaseConfigured()) return fallbackAcademicCatalog;
  const client = createServiceClient();
  const [{ data: universityRows, error: universityError }, { data: facultyRows, error: facultyError }, { data: cityRows, error: cityError }] = await Promise.all([
    client.from("universities").select("id,slug,name,short_name,website_url,is_active,last_verified_at").eq("is_active", true).order("name"),
    client.from("faculties").select("id,slug,university_id,name,short_name,official_url,is_active,last_verified_at").eq("is_active", true).order("name"),
    client.from("university_cities").select("university_id,city_id"),
  ]);
  if (universityError || facultyError || cityError) throw universityError || facultyError || cityError;
  const cityIds = new Map<string, string[]>();
  for (const row of cityRows || []) cityIds.set(String(row.university_id), [...(cityIds.get(String(row.university_id)) || []), String(row.city_id)]);
  const fallbackColors = new Map(fallbackAcademicCatalog.universities.map((item) => [item.id, item.color]));
  const universities: University[] = (universityRows || []).map((row) => ({
    id: String(row.id), slug: String(row.slug), name: String(row.name), shortName: String(row.short_name),
    color: fallbackColors.get(String(row.id)) || "#4f46e5", officialUrl: String(row.website_url), active: Boolean(row.is_active),
    lastVerifiedAt: String(row.last_verified_at), cityIds: cityIds.get(String(row.id)) || [],
  }));
  const faculties: Faculty[] = (facultyRows || []).map((row) => ({ id: String(row.id), slug: String(row.slug), universityId: String(row.university_id), name: String(row.name), shortName: String(row.short_name), officialUrl: String(row.official_url), active: Boolean(row.is_active), lastVerifiedAt: String(row.last_verified_at) }));
  return { universities, faculties };
}
