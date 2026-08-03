import { describe, expect, it } from "vitest";
import { classNames, daysUntil } from "@/lib/format";
describe("pomocné funkce", () => { it("počítá celé dny bez záporného výsledku", () => { expect(daysUntil("2026-08-04T12:00:00Z", new Date("2026-08-01T12:00:00Z"))).toBe(3); expect(daysUntil("2026-07-01", new Date("2026-08-01"))).toBe(0); }); it("spojuje jen platné názvy tříd", () => expect(classNames("a", false, null, "b")).toBe("a b")); });
