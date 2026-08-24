export type SearchableProfile = { username?: unknown; display_name?: unknown; email?: unknown };

export function matchesAdminProfileSearch(profile: SearchableProfile, query: string) {
  const normalized = query.trim().toLocaleLowerCase("cs-CZ");
  if (!normalized) return true;
  return [profile.username, profile.display_name, profile.email].some((value) => String(value || "").toLocaleLowerCase("cs-CZ").includes(normalized));
}
