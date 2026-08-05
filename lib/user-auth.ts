import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getCurrentUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const store = await cookies();
  const client = createServerClient(url, anon, { cookies: { getAll: () => store.getAll(), setAll: () => undefined } });
  const { data: { user } } = await client.auth.getUser();
  if (!user || !user.email_confirmed_at) return null;
  return { id: user.id, email: user.email || "", verified: true as const };
}
