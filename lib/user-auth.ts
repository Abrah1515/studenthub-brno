import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

export type AccountProfile = {
  id: string;
  email: string;
  username: string | null;
  displayName: string;
  role: string;
  accountStatus: "active" | "suspended" | "deleted";
  cityId: string | null;
  universityId: string | null;
  facultyId: string | null;
  studyProgram: string | null;
  studyYear: number | null;
  bio: string | null;
  interests: string[];
  avatarPath: string | null;
  avatarUrl: string | null;
  profileVisibility: "public" | "private";
  showFaculty: boolean;
  showStudyProgram: boolean;
  showStudyYear: boolean;
  communityRulesAccepted: boolean;
  trustedEventPublisher: boolean;
  complete: boolean;
};

export async function getCurrentUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const store = await cookies();
  const client = createServerClient(url, anon, { cookies: { getAll: () => store.getAll(), setAll: () => undefined } });
  const { data: { user } } = await client.auth.getUser();
  if (!user || !user.email_confirmed_at) return null;
  return { id: user.id, email: user.email || "", verified: true as const, provider: String(user.app_metadata?.provider || "email"), lastSignInAt: user.last_sign_in_at || null };
}

export async function getCurrentAccount(): Promise<AccountProfile | null> {
  const user = await getCurrentUser();
  if (!user || !isSupabaseConfigured()) return null;
  const { data } = await createServiceClient().from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!data) return null;
  const status = String(data.account_status || (data.is_blocked ? "suspended" : "active")) as AccountProfile["accountStatus"];
  const username = data.username ? String(data.username) : null;
  const displayName = String(data.display_name || "Student");
  const accepted = Boolean(data.community_rules_accepted_at);
  const { data: publisherPermission } = await createServiceClient().from("profile_permissions").select("status").eq("profile_id", user.id).eq("permission", "trusted_event_publisher").eq("status", "active").maybeSingle();
  let avatarUrl = data.avatar_url ? String(data.avatar_url) : null;
  if (data.avatar_path) { const { data: signed } = await createServiceClient().storage.from("profile-avatars").createSignedUrl(String(data.avatar_path), 60 * 60); avatarUrl = signed?.signedUrl || avatarUrl; }
  return {
    id: user.id, email: user.email, username, displayName, role: String(data.role || "user"), accountStatus: status,
    cityId: data.city_id ? String(data.city_id) : null, universityId: data.university_id ? String(data.university_id) : null,
    facultyId: data.faculty_id ? String(data.faculty_id) : null, studyProgram: data.study_program ? String(data.study_program) : null,
    studyYear: data.study_year == null ? null : Number(data.study_year), bio: data.bio ? String(data.bio) : null,
    interests: Array.isArray(data.interests) ? data.interests.map(String) : [], avatarPath: data.avatar_path ? String(data.avatar_path) : null,
    avatarUrl, profileVisibility: data.profile_visibility === "public" ? "public" : "private",
    showFaculty: data.show_faculty !== false, showStudyProgram: data.show_study_program !== false, showStudyYear: data.show_study_year !== false,
    communityRulesAccepted: accepted, trustedEventPublisher: status === "active" && data.role === "user" && Boolean(publisherPermission), complete: status === "active" && Boolean(username && displayName.trim().length >= 2 && accepted),
  };
}
