import { describe, expect, it } from "vitest";
import { coordinatesWithinCity, geocodingCity, geocodingQuery } from "@/lib/geocoding";

describe("městsky oddělené geokódování", () => {
  it.each([
    ["brno", "Brno"],
    ["praha", "Praha"],
    ["olomouc", "Olomouc"],
    ["ostrava", "Ostrava"],
  ])("doplní do dotazu správné město %s", (slug, name) => {
    const city = geocodingCity(slug);
    expect(city).not.toBeNull();
    expect(geocodingQuery("Hlavní 1", city!)).toBe(`Hlavní 1, ${name}, Česko`);
  });

  it("odmítne neznámé město a souřadnice mimo hranice vydání", () => {
    expect(geocodingCity("plzen")).toBeNull();
    const praha = geocodingCity("praha")!;
    expect(coordinatesWithinCity(50.0755, 14.4378, praha)).toBe(true);
    expect(coordinatesWithinCity(49.1951, 16.6068, praha)).toBe(false);
  });
});
