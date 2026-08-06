import { describe, expect, it } from "vitest";
import { decideSourceConflict } from "@/lib/sources/conflict-resolution";

describe("řešení konfliktů oficiálních zdrojů", () => {
  it("zvolí prokazatelně novější revizi", () => expect(decideSourceConflict({ modifiedAt: "2026-08-01T10:00:00Z", basis: "explicit_school_update" }, { modifiedAt: "2026-08-02T10:00:00Z", basis: "http_last_modified" })).toBe("proposed"));
  it("při shodném čase upřednostní explicitní aktualizaci školy", () => expect(decideSourceConflict({ modifiedAt: "2026-08-02T10:00:00Z", basis: "http_last_modified" }, { modifiedAt: "2026-08-02T10:00:00Z", basis: "explicit_school_update" })).toBe("proposed"));
  it("bez prokazatelného času vyžádá ruční kontrolu", () => expect(decideSourceConflict({ modifiedAt: null, basis: "first_detected" }, { modifiedAt: "2026-08-02T10:00:00Z", basis: "http_last_modified" })).toBe("needs_review"));
});
