import { describe, expect, it } from "vitest";
import { foldSearchText, includesFolded } from "@/lib/search";

describe("vyhledávání bez ohledu na velikost a diakritiku", () => {
  it("najde Řečkovice přes reckovice", () => expect(includesFolded("Knihovna Řečkovice", "reckovice")).toBe(true));
  it("sjednotí mezery i velká písmena", () => expect(foldSearchText("  MENZA   PřF ")).toBe("menza prf"));
});
