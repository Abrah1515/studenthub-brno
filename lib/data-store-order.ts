const orderColumnOverrides: Readonly<Record<string, string>> = {
  page_views: "viewed_at",
  link_checks: "checked_at",
  place_live_reports: "reported_at",
};

export function recordOrderColumn(table: string) {
  return orderColumnOverrides[table] || "created_at";
}
