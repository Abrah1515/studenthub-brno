"use client";

import { createClient } from "@supabase/supabase-js";

let cached: { token: string; expiresAt: number } | null = null;

async function hasAuthenticatedUser() {
  const response = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" }).catch(() => null);
  if (!response?.ok) return false;
  const body = await response.json().catch(() => ({}));
  return Boolean(body.user);
}

async function accessToken() {
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  if (!await hasAuthenticatedUser()) return null;
  const response = await fetch("/api/auth/realtime-token", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) return null;
  const body = await response.json().catch(() => ({}));
  if (typeof body.accessToken !== "string" || !body.accessToken) return null;
  cached = { token: body.accessToken, expiresAt: Date.now() + 4 * 60 * 1000 };
  return cached.token;
}

export async function createAuthenticatedRealtimeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !await accessToken()) return null;
  const client = createClient(url, key, {
    accessToken,
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  await client.realtime.setAuth();
  return client;
}
