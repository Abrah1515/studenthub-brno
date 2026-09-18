import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ profile: {} as Record<string, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [] }) }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "test", email: "test@example.invalid", email_confirmed_at: "2026-09-14" } } }) } }) }));
vi.mock("@/lib/supabase-server", () => ({ isSupabaseConfigured: () => true, createServiceClient: () => ({ from: (table: string) => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: table === "profiles" ? state.profile : { status: "active" } }) };
  return query;
} }) }));
import { getCurrentAccount } from "@/lib/user-auth";

describe("session respects current database suspension", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-only");
    state.profile = { username: "test", display_name: "Test Student", role: "user", account_status: "active", is_blocked: false, community_rules_accepted_at: "2026-09-14" };
  });
  it("rejects a blocked profile even when account_status is still active", async () => {
    state.profile.is_blocked = true;
    expect(await getCurrentAccount()).toMatchObject({ accountStatus: "suspended", complete: false, trustedEventPublisher: false });
  });
  it("keeps an active confirmed and complete profile usable", async () => {
    expect(await getCurrentAccount()).toMatchObject({ accountStatus: "active", complete: true });
  });
  it("does not turn a deleted account into an active one", async () => {
    state.profile.account_status = "deleted";
    expect(await getCurrentAccount()).toMatchObject({ accountStatus: "deleted", complete: false });
  });
});
