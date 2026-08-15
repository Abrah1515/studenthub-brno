import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

let helpers: typeof import("@/lib/community-events");
beforeAll(async () => { helpers = await import("@/lib/community-events"); });

describe("bezpečnost komunitních akcí", () => {
  it("odstraní HTML a řídicí znaky, ale zachová bezpečné odstavce", () => { expect(helpers.sanitizePlainText("<b>Akce</b>\u0000  pro studenty")).toBe("Akce pro studenty"); expect(helpers.sanitizePlainText("První řádek\n\n\n\nDruhý", true)).toBe("První řádek\n\nDruhý"); });
  it("normalizuje duplicity bez ohledu na diakritiku a velikost písmen", () => { const first = helpers.communityEventFingerprint({ cityId: "brno", title: "Studentská párty", startsAt: "2026-09-15T18:00:00+02:00", venue: "Kavárna" }); const second = helpers.communityEventFingerprint({ cityId: "brno", title: "STUDENTSKA PARTY", startsAt: "2026-09-15T18:00:59+02:00", venue: "KAVARNA" }); expect(first).toBe(second); });
  it("správu dovolí jen s původním náhodným tokenem", () => { const management = helpers.newManagementToken(); expect(management.token).toMatch(/^[a-f0-9]{64}$/); expect(helpers.managementTokenMatches(management.token, management.hash)).toBe(true); expect(helpers.managementTokenMatches("0".repeat(64), management.hash)).toBe(false); expect(helpers.managementTokenMatches("neplatne", management.hash)).toBe(false); });
});
