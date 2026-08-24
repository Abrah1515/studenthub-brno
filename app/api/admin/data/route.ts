import { NextResponse } from "next/server";
import { brnoCity } from "@/lib/cities";
import { getAdminUser } from "@/lib/admin-auth";
import { listRecords } from "@/lib/data-store";
import { contentSources } from "@/lib/sources/registry";
import { verifiedFallbackData } from "@/lib/verified-data";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { externalContentProviders } from "@/lib/external-content-providers";

export async function GET() {
  const user = await getAdminUser(); if (!user) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  const names = ["cities", "academic_events", "community_events", "places", "offers", "jobs", "service_requests", "submissions", "outbound_clicks", "page_views", "content_sources", "source_sync_runs", "source_review_queue", "link_checks", "content_publication_events", "buddy_posts", "buddy_join_requests", "content_reports", "contact_messages", "academic_event_conflicts", "community_profiles", "community_posts", "community_comments", "community_reports", "community_moderation_history", "community_moderation_settings", "anonymous_installations", "internal_notifications", "push_subscriptions", "calendar_subscriptions", "place_live_reports", "academic_event_changes", "notification_deliveries", "moderation_actions", "marketplace_listings", "marketplace_reports", "marketplace_history", "marketplace_moderation_actions", "marketplace_abuse_blocks"] as const;
  const rows = await Promise.all(names.map((name) => listRecords(name)));
  const values = Object.fromEntries(names.map((name, index) => [name, rows[index]])) as Record<(typeof names)[number], Record<string, unknown>[]>;
  let profiles: Record<string, unknown>[] = []; let profileReports: Record<string, unknown>[] = []; let accountModerationHistory: Record<string, unknown>[] = []; let profilePermissions: Record<string, unknown>[] = []; let profilePermissionAudit: Record<string, unknown>[] = [];
  if (isSupabaseConfigured() && user.role === "super_admin") {
    const client = createServiceClient(); const [profileResult, reportResult, historyResult, permissionResult, permissionAuditResult, authResult] = await Promise.all([
      client.from("profiles").select("id,username,display_name,role,city_id,university_id,faculty_id,study_year,profile_visibility,account_status,suspended_at,community_rules_accepted_at,created_at,updated_at").order("created_at", { ascending: false }).limit(1000),
      client.from("profile_reports").select("id,reporter_id,reported_id,reason,detail,status,created_at,reviewed_at").order("created_at", { ascending: false }).limit(500),
      client.from("account_moderation_history").select("id,profile_id,actor_id,action,reason,created_at").order("created_at", { ascending: false }).limit(500),
      client.from("profile_permissions").select("id,profile_id,permission,status,internal_reason,granted_by,granted_at,suspended_at,revoked_at,updated_at").eq("permission", "trusted_event_publisher").order("updated_at", { ascending: false }).limit(1000),
      client.from("profile_permission_audit").select("id,permission_id,profile_id,actor_id,action,previous_status,new_status,reason,created_at").order("created_at", { ascending: false }).limit(1000),
      client.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    const authUsers = new Map((authResult.data?.users || []).map((authUser) => [authUser.id, authUser]));
    profiles = (profileResult.data || []).map((profile) => { const authUser = authUsers.get(String(profile.id)); return { ...profile, email: authUser?.email || null, email_confirmed_at: authUser?.email_confirmed_at || null, auth_banned_until: authUser?.banned_until || null, last_sign_in_at: authUser?.last_sign_in_at || null, profile_complete: Boolean(profile.username && profile.display_name && profile.community_rules_accepted_at && profile.account_status === "active" && authUser?.email_confirmed_at) }; });
    profileReports = reportResult.data || []; accountModerationHistory = historyResult.data || []; profilePermissions = permissionResult.data || []; profilePermissionAudit = permissionAuditResult.data || [];
  }
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
  const allowedCommunityPostIds = new Set(scoped(values.community_posts).map((row) => String(row.id)));
  const communityComments = user.role === "super_admin" ? values.community_comments : values.community_comments.filter((row) => allowedCommunityPostIds.has(String(row.post_id)));
  const externalProviders = externalContentProviders().map(({ id, kind, format, enabled, permissionConfirmed, maxCheckIntervalHours, statusReason }) => ({ id, kind, format, enabled, permissionConfirmed, maxCheckIntervalHours, statusReason }));
  const cityInstallations = user.role === "super_admin" ? values.anonymous_installations : user.role === "faculty_editor" ? [] : values.anonymous_installations.filter((row) => row.city_id === user.cityId);
  const installationIds = new Set(cityInstallations.map((row) => String(row.id)));
  const cityNotifications = values.internal_notifications.filter((row) => installationIds.has(String(row.installation_id)));
  const notificationIds = new Set(cityNotifications.map((row) => String(row.id)));
  const cityPlaceIds = new Set(scoped(values.places).map((row) => String(row.id)));
  const scopedAcademicIds = new Set(scoped(values.academic_events).map((row) => String(row.id)));
  const operations = {
    installations: cityInstallations.length,
    activePushSubscriptions: values.push_subscriptions.filter((row) => installationIds.has(String(row.installation_id)) && row.enabled).length,
    activeCalendarSubscriptions: values.calendar_subscriptions.filter((row) => installationIds.has(String(row.installation_id)) && row.is_active).length,
    unreadNotifications: cityNotifications.filter((row) => !row.read_at).length,
    pendingPush: cityNotifications.filter((row) => !row.push_sent_at && new Date(String(row.available_at)).getTime() <= Date.now()).length,
    sentPush: values.notification_deliveries.filter((row) => notificationIds.has(String(row.notification_id)) && row.status === "sent").length,
    failedPush: values.notification_deliveries.filter((row) => notificationIds.has(String(row.notification_id)) && ["failed", "expired"].includes(String(row.status))).length,
    freshPlaceReports: values.place_live_reports.filter((row) => cityPlaceIds.has(String(row.place_id)) && !row.hidden_at && new Date(String(row.expires_at)).getTime() > Date.now()).length,
    suspiciousPlaceReports: values.place_live_reports.filter((row) => cityPlaceIds.has(String(row.place_id)) && row.is_suspicious && !row.hidden_at).length,
    academicChanges: values.academic_event_changes.filter((row) => scopedAcademicIds.has(String(row.academic_event_id))).length,
    moderationActions: user.role === "faculty_editor" ? 0 : scoped(values.moderation_actions).length,
  };
  const placeLiveReports = values.place_live_reports.filter((row) => cityPlaceIds.has(String(row.place_id))).map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "installation_id")));
  const placeReportIds = new Set(placeLiveReports.map((row) => String(row.id)));
  const liveModerationActions = values.moderation_actions.filter((row) => row.target_type === "place_live_report" && placeReportIds.has(String(row.target_id)));
  const marketplaceListings = user.role === "faculty_editor" ? [] : scoped(values.marketplace_listings).map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !["seller_email", "seller_email_hash", "request_fingerprint", "verification_token_hash", "management_token_hash", "duplicate_fingerprint", "moderation_note"].includes(key))));
  const marketplaceIds = new Set(marketplaceListings.map((row) => String(row.id)));
  const marketplaceReports = user.role === "faculty_editor" ? [] : values.marketplace_reports.filter((row) => marketplaceIds.has(String(row.listing_id))).map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "reporter_hash")));
  const marketplaceHistory = user.role === "faculty_editor" ? [] : values.marketplace_history.filter((row) => marketplaceIds.has(String(row.listing_id)));
  const marketplaceActions = user.role === "faculty_editor" ? [] : values.marketplace_moderation_actions.filter((row) => !row.listing_id || marketplaceIds.has(String(row.listing_id))).map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "snapshot")));
  const marketplaceBlocks = user.role === "super_admin" ? values.marketplace_abuse_blocks.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "identifier_hash"))) : [];
  const profilesWithCounts = profiles.map((profile) => ({ ...profile, content_count: values.community_posts.filter((row) => row.author_id === profile.id).length + values.community_comments.filter((row) => row.author_id === profile.id).length + values.buddy_posts.filter((row) => row.owner_id === profile.id).length + values.marketplace_listings.filter((row) => row.seller_id === profile.id).length + values.community_events.filter((row) => row.author_id === profile.id).length, report_count: profileReports.filter((row) => row.reported_id === profile.id && row.status === "new").length }));
  return NextResponse.json({ _meta: { dataSource: isSupabaseConfigured() ? "supabase" : verifiedFallback ? "verified_fallback" : "unconfigured", verifiedFallback, externalProviders, operations }, profiles: profilesWithCounts, profile_reports: profileReports, account_moderation_history: accountModerationHistory, profile_permissions: profilePermissions, profile_permission_audit: profilePermissionAudit, cities: scoped(values.cities), academic_events: scoped(values.academic_events), community_events: user.role === "faculty_editor" ? [] : scoped(values.community_events), places: scoped(values.places), place_live_reports: placeLiveReports, moderation_actions: liveModerationActions, offers: scoped(values.offers), jobs: scoped(values.jobs), marketplace_listings: marketplaceListings, marketplace_reports: marketplaceReports, marketplace_history: marketplaceHistory, marketplace_moderation_actions: marketplaceActions, marketplace_abuse_blocks: marketplaceBlocks, service_requests: user.role === "faculty_editor" ? [] : scoped(values.service_requests), submissions: scoped(values.submissions), outbound_clicks: user.role === "faculty_editor" ? [] : scoped(values.outbound_clicks), page_views: user.role === "faculty_editor" ? [] : scoped(values.page_views), content_sources: scoped(sources), source_sync_runs: scoped(values.source_sync_runs), source_review_queue: scoped(values.source_review_queue), link_checks: privileged(values.link_checks), content_publication_events: user.role === "faculty_editor" ? [] : scoped(values.content_publication_events), buddy_posts: scoped(values.buddy_posts), buddy_join_requests: user.role === "faculty_editor" ? [] : privileged(values.buddy_join_requests), content_reports: user.role === "faculty_editor" ? [] : scoped(values.content_reports), contact_messages: user.role === "faculty_editor" ? [] : scoped(values.contact_messages), academic_event_conflicts: scoped(values.academic_event_conflicts), community_profiles: user.role === "faculty_editor" ? [] : scoped(values.community_profiles), community_posts: user.role === "faculty_editor" ? [] : scoped(values.community_posts), community_comments: user.role === "faculty_editor" ? [] : communityComments, community_reports: user.role === "faculty_editor" ? [] : scoped(values.community_reports), community_moderation_history: user.role === "faculty_editor" ? [] : scoped(values.community_moderation_history), community_moderation_settings: user.role === "faculty_editor" ? [] : scoped(values.community_moderation_settings) });
}
