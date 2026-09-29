import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mapSource = readFileSync("components/places-explorer.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");

describe("stabilita mapy míst", () => {
  it("neanimuje Leaflet transform používaný k polohování markerů", () => {
    expect(styles).not.toMatch(
      /\.place-map-marker\s*\{[^}]*transition\s*:\s*transform/i,
    );
  });

  it("zaměřuje mapu jen při skutečné změně vybraného místa", () => {
    expect(mapSource).toContain(
      "focusedSelectionRef.current !== selectedId",
    );
    expect(mapSource).toContain("map.stop()");
    expect(mapSource).not.toContain(
      "}, [mainItems, selectedId, utilityItems]);",
    );
  });
});
