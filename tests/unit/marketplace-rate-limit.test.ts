import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), configured: vi.fn(() => true) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({
  createServiceClient: () => ({ rpc: mocks.rpc }),
  isSupabaseConfigured: mocks.configured,
}));

import { consumeMarketplaceLimit } from "@/lib/marketplace-server";

describe("produkční ochrana burzy proti spamu", () => {
  beforeEach(() => { mocks.rpc.mockReset(); mocks.configured.mockReturnValue(true); });

  it("posílá do databáze krátkou akci a přesně smluvní hash", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    await expect(consumeMarketplaceLimit(new Request("https://example.test", { headers: { "x-forwarded-for": "203.0.113.7" } }), "create", 3, 86_400, "11111111-1111-4111-8111-111111111111")).resolves.toEqual({ status: "allowed" });
    expect(mocks.rpc).toHaveBeenCalledWith("consume_marketplace_rate_limit", expect.objectContaining({ p_action: "create", p_limit: 3, p_window_seconds: 86_400, p_key_hash: expect.stringMatching(/^[a-f0-9]{24}$/) }));
  });

  it("rozlišuje dosažený limit od chyby databáze", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
    const request = () => new Request("https://example.test", { headers: { "x-forwarded-for": "203.0.113.7" } });
    await expect(consumeMarketplaceLimit(request(), "create", 3, 86_400, "11111111-1111-4111-8111-111111111111")).resolves.toEqual({ status: "limited" });
    await expect(consumeMarketplaceLimit(request(), "create", 3, 86_400, "11111111-1111-4111-8111-111111111111")).resolves.toEqual({ status: "error", code: "PGRST202" });
  });

  it("odmítne neplatný interní parametr bez volání databáze", async () => {
    await expect(consumeMarketplaceLimit(new Request("https://example.test"), `create:${"a".repeat(36)}`, 3, 86_400, "account")).resolves.toEqual({ status: "error", code: "invalid_parameters" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
