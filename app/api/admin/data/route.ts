import { NextResponse } from "next/server";
import { brnoCity } from "@/lib/cities";
import { getAdminUser } from "@/lib/admin-auth";
import { listRecords } from "@/lib/data-store";
import { contentSources } from "@/lib/sources/registry";
import { verifiedFallbackData } from "@/lib/verified-data";
import { isSupabaseConfigured } from "@/lib/supabase-server";
import { externalContentProviders } from "@/lib/external-content-providers";

export async function GET() {
  const user = await getAdminUser(); if (!user) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  const names = ["cities", "academic_events", "places", "offers", "jobs", "service_requests", "submissions", "outbound_clicks", "page_views", "content_sources", "source_sync_runs", "source_review_queue", "link_checks", "content_publication_events", "buddy_posts", "buddy_join_requests", "content_reports", "contact_messages", "academic_event_conflicts"] as const;
  const rows = await Promise.all(names.map((name) => listRecords(name)));
  const values = Object.fromEntries(names.map((name, index) => [name, rows[index]])) as Record<(typeof names)[number], Record<string, unknown>[]>;
  const verifiedFallback = !isSupabaseConfigured() && process.env.ALLOW_VERIFIED_FALLBACK === "true";
  if (verifiedFallback) {
    const merge = (fallback: Record<string, unknown>[], stored: Record<string, unknown>[]) => [...fallback.filter((item) => !stored.some((row) => String(row.id) === String(item.id))), ...stored];
    values.academic_events = merge(verifiedFallbackData.academic_events.map((item) => ({ ...item, source_id: item.sourceId, university_id: item.universityId, faculty_id: item.facultyId, city_id: item.cityId, status: item.status, data_origin: "verified_fallback", read_only: true })), values.academic_events);
    values.places = merge(verifiedFallbackData.places.map((item) => ({ ...item, city_id: item.cityId || "brno", status: "approved", data_origin: "verified_fallback", read_only: true })), values.places);
    values.offers = merge(verifiedFallbackData.offers.map((item) => ({ ...item, status: "approved", data_origin: "verified_fallback", read_only: true })), values.offers);
    values.jobs = merge(verifiedFallbackData.jobs.map((item) => ({ ...item, status: item.status, data_origin: "verified_fallback", read_only: true })), values.jobs);
  }
  if (!values.cities.length && user.cityId === "brno") values.cities = [{ id: brnoCity.id, slug: brnoCity.slug, name: brnoCity.name, region: brnoCity.region, country_code: brnoCity.countryCode, latitude: brnoCity.latitude, longitude: brnoCity.longitude, map_bounds: brnoCity.mapBounds, map_zoom: brnoCity.mapZoom, enabled: true, public_status: "published", sort_order: brnoCity.sortOrder }];
  const scoped = (items: Record<string, unknown>[]) => items.filter((row) => {
    if (user.role === "super_admin") return true;
    if (user.role === "faculty_editor") return row.faculty_id === user.facultyId || row.facultyId === user.facultyId || (row.content as Record<string, unknown> | undefined)?.facultyId === user.facultyId;
    const rowCity = row.city_id ?? row.cityId ?? (row.content as Record<string, unknown> | undefined)?.cityId;
    return rowCity === user.cityId || (row.id === user.cityId && row.slug === user.cityId) || (user.cityId === "brno" && !rowCity && (row.university_id || row.universityId));
  });
  const storedSources = new Map(values.content_sources.map((source) => [String(source.id), source]));
  const fajnStatus = externalContentProviders().find((provider) => provider.id === "fajn-brigady");
  const sources = contentSources.map((source) => {
    const merged = { ...source, ...(storedSources.get(source.id) || {}) } as Record<string, unknown>;
    if (source.sourceType !== "job_feed") return merged;
    return { ...merged, last_final_url: undefined, last_document_url: undefined, connector_enabled: Boolean(fajnStatus?.enabled), connector_status_reason: fajnStatus?.statusReason, active_count: values.jobs.filter((job) => job.provider_key === "fajn-brigady" && job.status === "approved" && !job.is_demo).length };
  });
  const privileged = user.role === "super_admin" ? (items: Record<string, unknown>[]) => items : scoped;
  const externalProviders = externalContentProviders().map(({ id, kind, format, enabled, permissionConfirmed, maxCheckIntervalHours, statusReason }) => ({ id, kind, format, enabled, permissionConfirmed, maxCheckIntervalHours, statusReason }));
  return NextResponse.json({ _meta: { dataSource: isSupabaseConfigured() ? "supabase" : verifiedFallback ? "verified_fallback" : "unconfigured", verifiedFallback, externalProviders }, cities: scoped(values.cities), academic_events: scoped(values.academic_events), places: scoped(values.places), offers: scoped(values.offers), jobs: scoped(values.jobs), service_requests: user.role === "faculty_editor" ? [] : scoped(values.service_requests), submissions: scoped(values.submissions), outbound_clicks: user.role === "faculty_editor" ? [] : scoped(values.outbound_clicks), page_views: user.role === "faculty_editor" ? [] : scoped(values.page_views), content_sources: scoped(sources), source_sync_runs: scoped(values.source_sync_runs), source_review_queue: scoped(values.source_review_queue), link_checks: privileged(values.link_checks), content_publication_events: user.role === "faculty_editor" ? [] : scoped(values.content_publication_events), buddy_posts: scoped(values.buddy_posts), buddy_join_requests: user.role === "faculty_editor" ? [] : privileged(values.buddy_join_requests), content_reports: user.role === "faculty_editor" ? [] : scoped(values.content_reports), contact_messages: user.role === "faculty_editor" ? [] : scoped(values.contact_messages), academic_event_conflicts: scoped(values.academic_event_conflicts) });
}
