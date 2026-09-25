import { describe, expect, it } from "vitest";
import {
  clusterUtilityPlaces, defaultMapLayers, layersForDirectCategory, nearestUtilityPlaces,
  placeMatchesLayers, utilityViewportRequestKey, utilityVisibleIndividually,
  type MapViewport,
} from "@/lib/place-map-layers";
import type { Place } from "@/lib/types";

function place(id: string, categoryCode: Place["categoryCode"], lat = 49.2, lng = 16.6): Place {
  const labels: Record<string, Place["category"]> = {
    public_toilet: "Veřejné toalety", drinking_fountain: "Pítka", bench: "Lavičky a odpočinek", library: "Knihovna",
  };
  return {
    id, name: id, categoryCode, category: labels[categoryCode || "library"], address: "Brno",
    website: "", sourceUrl: "https://example.test", lastVerifiedAt: "2026-09-25T08:00:00Z",
    verificationStatus: "verified", lat, lng, note: "Test",
  };
}

const viewport: MapViewport = {
  south: 49.1, west: 16.5, north: 49.3, east: 16.7, zoom: 14,
  center: { lat: 49.2, lng: 16.6 },
};

describe("mapové vrstvy míst", () => {
  it("ve výchozím stavu zobrazuje hlavní místa a skrývá utility", () => {
    expect(placeMatchesLayers(place("library", "library"), defaultMapLayers)).toBe(true);
    expect(placeMatchesLayers(place("wc", "public_toilet"), defaultMapLayers)).toBe(false);
    expect(placeMatchesLayers(place("water", "drinking_fountain"), defaultMapLayers)).toBe(false);
    expect(placeMatchesLayers(place("bench", "bench"), defaultMapLayers)).toBe(false);
  });

  it("přímý výběr utility kategorie zapne pouze odpovídající vrstvu", () => {
    expect(layersForDirectCategory("Veřejné toalety", defaultMapLayers)).toEqual({ main: false, public_toilet: true, drinking_fountain: false, bench: false });
    expect(layersForDirectCategory("Pítka", defaultMapLayers)).toEqual({ main: false, public_toilet: false, drinking_fountain: true, bench: false });
  });

  it("lavičky zůstávají seskupené do velmi blízkého přiblížení", () => {
    expect(utilityVisibleIndividually("bench", 16)).toBe(false);
    expect(utilityVisibleIndividually("bench", 17)).toBe(true);
    expect(clusterUtilityPlaces([place("a", "bench"), place("b", "bench", 49.20001, 16.60001)], 14)).toHaveLength(1);
    expect(clusterUtilityPlaces([place("a", "bench"), place("b", "bench", 49.20001, 16.60001)], 17).every((group) => !group.clustered)).toBe(true);
  });

  it("shlukuje velký dataset bez vytváření markeru pro každý bod", () => {
    const points = Array.from({ length: 500 }, (_, index) => place(`wc-${index}`, "public_toilet", 49.2 + (index % 10) * .00001, 16.6 + (index % 12) * .00001));
    const groups = clusterUtilityPlaces(points, 12);
    expect(groups.length).toBeLessThan(20);
    expect(groups.reduce((sum, group) => sum + group.items.length, 0)).toBe(500);
  });

  it("klíč požadavku závisí na výřezu a nezávisí na pořadí kategorií", () => {
    expect(utilityViewportRequestKey(viewport, ["public_toilet", "bench"])).toBe(utilityViewportRequestKey(viewport, ["bench", "public_toilet"]));
    expect(utilityViewportRequestKey({ ...viewport, east: 16.8 }, ["bench"])).not.toBe(utilityViewportRequestKey(viewport, ["bench"]));
  });

  it("najde nejbližší utility jak pro GPS, tak pro střed mapy", () => {
    const points = [place("near", "drinking_fountain", 49.2001, 16.6001), place("far", "drinking_fountain", 49.25, 16.65)];
    expect(nearestUtilityPlaces(points, { lat: 49.2, lng: 16.6 }, "drinking_fountain")[0].place.id).toBe("near");
    expect(nearestUtilityPlaces(points, viewport.center, "drinking_fountain")[0].distanceKm).toBeLessThan(1);
  });
});
