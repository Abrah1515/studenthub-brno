import { describe, expect, it } from "vitest";
import { classifyLinkStatus } from "@/lib/link-status";

describe("klasifikace kontroly odkazů", () => {
  it("odlišuje úspěch, blokování, dočasnou chybu a rozbitý odkaz", () => {
    expect(classifyLinkStatus(200)).toBe("ok");
    expect(classifyLinkStatus(403)).toBe("blocked");
    expect(classifyLinkStatus(429)).toBe("temporary_failure");
    expect(classifyLinkStatus(503)).toBe("temporary_failure");
    expect(classifyLinkStatus(404)).toBe("broken");
    expect(classifyLinkStatus(410)).toBe("broken");
  });
});
