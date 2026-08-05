import "server-only";

import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

export async function expireBuddyPosts() {
  if (!isSupabaseConfigured()) return 0;
  const { data, error } = await createServiceClient().from("buddy_posts").update({ status: "expired" }).eq("status", "active").lt("expires_at", new Date().toISOString()).select("id");
  if (error) throw error; return data?.length || 0;
}
