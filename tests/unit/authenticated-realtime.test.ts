import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), setAuth: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

describe("authenticated realtime client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-anon-key");
    mocks.createClient.mockReset();
    mocks.setAuth.mockReset();
    mocks.createClient.mockReturnValue({ realtime: { setAuth: mocks.setAuth } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("u anonymního návštěvníka nevolá chráněný token endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: null, profile: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { createAuthenticatedRealtimeClient } = await import("@/lib/authenticated-realtime");
    await expect(createAuthenticatedRealtimeClient()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", expect.any(Object));
    expect(fetchMock).not.toHaveBeenCalledWith("/api/auth/realtime-token", expect.anything());
  });

  it("u přihlášeného uživatele nastaví krátkodobý Realtime token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: "user-1" } }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: "session-token" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const { createAuthenticatedRealtimeClient } = await import("@/lib/authenticated-realtime");
    await expect(createAuthenticatedRealtimeClient()).resolves.toBeTruthy();
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/realtime-token", expect.any(Object));
    expect(mocks.setAuth).toHaveBeenCalledOnce();
  });
});
