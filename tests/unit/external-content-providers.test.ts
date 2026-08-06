import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

async function providers() {
  return (await import("@/lib/external-content-providers")).externalContentProviders();
}

afterEach(() => vi.unstubAllEnvs());

describe("smluvní externí feedy", () => {
  it("ponechá ISIC vypnutý bez písemného oprávnění i při nastaveném URL", async () => {
    vi.stubEnv("ISIC_FEED_ENABLED", "true");
    vi.stubEnv("ISIC_FEED_PERMISSION_CONFIRMED", "false");
    vi.stubEnv("ISIC_FEED_URL", "https://partner.example.cz/isic.json");
    expect((await providers()).find((provider) => provider.id === "isic")).toMatchObject({ enabled: false, permissionConfirmed: false, maxCheckIntervalHours: 9 });
  });

  it("vyžaduje současně feature flag, oprávnění a smluvní URL", async () => {
    vi.stubEnv("ISIC_FEED_ENABLED", "true");
    vi.stubEnv("ISIC_FEED_PERMISSION_CONFIRMED", "true");
    vi.stubEnv("ISIC_FEED_URL", "https://partner.example.cz/isic.json");
    expect((await providers()).find((provider) => provider.id === "isic")).toMatchObject({ enabled: true, permissionConfirmed: true, maxCheckIntervalHours: 9 });
  });
});
