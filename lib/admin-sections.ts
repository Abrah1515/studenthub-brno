export const adminSectionKeys = ["cities", "content_sources", "academic_events", "community_events", "community_forum", "chat_reports", "profiles", "places", "live_reports", "offers", "jobs", "marketplace", "service_requests", "buddy_posts", "contact_messages", "content_reports", "academic_event_conflicts", "analytics", "admin_users", "submissions", "source_review_queue"] as const;
export type AdminSection = (typeof adminSectionKeys)[number];

const facultySections = new Set<AdminSection>(["content_sources", "academic_events", "places", "live_reports", "offers", "jobs", "academic_event_conflicts", "submissions", "source_review_queue"]);
const cityEditorSections = new Set<AdminSection>([
  "content_sources",
  "academic_events",
  "community_events",
  "community_forum",
  "chat_reports",
  "places",
  "live_reports",
  "offers",
  "jobs",
  "marketplace",
  "buddy_posts",
  "content_reports",
  "academic_event_conflicts",
  "submissions",
  "source_review_queue",
]);
export function isAdminSection(value: string | null | undefined): value is AdminSection { return Boolean(value && (adminSectionKeys as readonly string[]).includes(value)); }
export function adminSectionAllowed(section: AdminSection, role: string) {
  if (role === "super_admin") return true;
  if (role === "admin") return section !== "admin_users" && section !== "profiles";
  if (role === "city_editor") return cityEditorSections.has(section);
  if (role === "faculty_editor") return facultySections.has(section);
  return false;
}
export function adminSectionsForRole(role: string) { return adminSectionKeys.filter((section) => adminSectionAllowed(section, role)); }
export function defaultAdminSection(role: string): AdminSection { return role === "faculty_editor" ? "content_sources" : "content_sources"; }
