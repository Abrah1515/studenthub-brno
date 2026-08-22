type NotificationRow = { kind?: unknown; target_type?: unknown; target_id?: unknown };
type InstallationRow = { muted_categories?: unknown };
type AcademicEventRow = { id?: unknown; category?: unknown };

export function automaticPushIsMuted(notification: NotificationRow, installation: InstallationRow | undefined, academicEvents: AcademicEventRow[]) {
  if (notification.target_type !== "academic_event" || !["academic_change", "new_important_term"].includes(String(notification.kind))) return false;
  const muted = Array.isArray(installation?.muted_categories) ? installation.muted_categories.map(String) : [];
  const event = academicEvents.find((item) => String(item.id) === String(notification.target_id));
  return Boolean(event && muted.includes(String(event.category)));
}
