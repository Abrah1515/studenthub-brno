import { describe, expect, it } from "vitest";
import { deduplicatePlaces, googleMapsDirectionsUrl, haversineDistanceKm, placeDedupeKey } from "@/lib/places";
import type { Place } from "@/lib/types";

function place(id: string, lastVerifiedAt: string, overrides: Partial<Place> = {}): Place {
  return { id, cityId: "brno", name: "Večerní studovna MENDELU", category: "Studovna" as Place["category"], address: "Zemědělská 1, Brno", website: "https://example.test", sourceUrl: "https://example.test", lastVerifiedAt, verificationStatus: "verified", lat: 49.2101, lng: 16.6152, note: "", ...overrides };
}

describe("místa, navigace a vzdálenost", () => {
  it("vytvoří přesný Google Maps odkaz ze souřadnic", () => expect(googleMapsDirectionsUrl(place("p", "2026-08-17"))).toBe("https://www.google.com/maps/dir/?api=1&destination=49.2101,16.6152"));
  it("počítá Haversinovu vzdálenost bez odeslání polohy", () => expect(haversineDistanceKm({ lat: 49.1951, lng: 16.6068 }, { lat: 49.2101, lng: 16.6152 })).toBeCloseTo(1.78, 1));
  it("deduplikuje normalizovaný název a adresu a ponechá novější ověření", () => expect(deduplicatePlaces([place("old", "2026-01-01"), place("new", "2026-08-17", { name: "  večerní STUDOVNA Mendelu ", address: "Zemědělská 1 – Brno" })]).map((item) => item.id)).toEqual(["new"]));
  it("sloučí stejné místo s odlišnou oficiální adresou a zdrojovým ID", () => expect(deduplicatePlaces([
    place("legacy", "2026-08-17", { name: "Knihovna univerzitního kampusu MUNI", address: "Kamenice 753/5, Brno, budova B09", lat: 49.1776, lng: 16.5698, osmId: "legacy-kuk" }),
    place("official", "2026-08-22", { name: "Knihovna univerzitního kampusu MUNI", address: "Kamenice 5, Brno, pavilon 09", lat: 49.177067, lng: 16.570126, osmId: "official-kuk" }),
  ]).map((item) => item.id)).toEqual(["official"]));
  it("nesloučí stejně pojmenované pobočky na různých adresách", () => expect(deduplicatePlaces([
    place("north", "2026-08-22", { name: "Studentská kavárna", lat: 49.23, lng: 16.57 }),
    place("centre", "2026-08-22", { name: "Studentská kavárna", address: "Centrum Brna", lat: 49.19, lng: 16.61 }),
  ])).toHaveLength(2));
  it("dává přednost stabilnímu zdrojovému ID", () => { expect(placeDedupeKey({ name: "A", address: "První", osmId: "node:123", sourceExternalId: "official-42" })).toBe("source:official 42"); expect(deduplicatePlaces([place("old", "2026-01-01", { osmId: "123" }), place("new", "2026-08-17", { osmId: "123", name: "Nový název", address: "Jiná adresa" })]).map((item) => item.id)).toEqual(["new"]); });
});
