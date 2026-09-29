import { describe, expect, it } from "vitest";
import { cityEditions } from "@/lib/city-editions";
import { canonicalRedirectTarget, internalRouteForBrno, legacyPublicPath } from "@/lib/platform-routing";

describe("platformní routing a městské edice", () => {
  it("má tři aktivní městské edice bez falešných odkazů", () => {
    expect(cityEditions.map(({ slug, active, href }) => ({ slug, active, href }))).toEqual([
      { slug: "brno", active: true, href: "/brno" },
      { slug: "praha", active: true, href: "/praha" },
      { slug: "ostrava", active: false, href: undefined },
      { slug: "olomouc", active: true, href: "/olomouc" },
    ]);
  });

  it("převádí staré veřejné cesty přímo pod Brno", () => {
    expect(legacyPublicPath("/kalendar")).toBe("/brno/kalendar");
    expect(legacyPublicPath("/komunita")).toBe("/brno/komunita");
    expect(legacyPublicPath("/profil/adam")).toBe("/brno/profil/adam");
    expect(legacyPublicPath("/muni")).toBe("/brno/skoly/muni");
    expect(legacyPublicPath("/kontakt")).toBe("/kontakt");
  });

  it("překládá jen skutečné brněnské routy na existující implementaci", () => {
    expect(internalRouteForBrno("/brno/profil/adam")).toBe("/profil/adam");
    expect(internalRouteForBrno("/brno/profily")).toBe("/profily");
    expect(internalRouteForBrno("/brno/chat/123")).toBeNull();
    expect(internalRouteForBrno("/brno/nastaveni")).toBeNull();
    expect(internalRouteForBrno("/brno/kalendar")).toBeNull();
    expect(internalRouteForBrno("/praha/chat")).toBeNull();
  });

  it("přesměruje starou produkční doménu, ale nikdy infrastrukturu", () => {
    expect(canonicalRedirectTarget("studenthub-brno.vercel.app", "/")).toEqual({ hostname: "studenthubapp.cz", pathname: "/brno" });
    expect(canonicalRedirectTarget("studenthub-brno.vercel.app", "/komunita")).toEqual({ hostname: "studenthubapp.cz", pathname: "/brno/komunita" });
    expect(canonicalRedirectTarget("studenthub-brno.vercel.app", "/api/cron/sync-sources")).toBeNull();
    expect(canonicalRedirectTarget("www.studenthubapp.cz", "/brno/mista")).toEqual({ hostname: "studenthubapp.cz", pathname: "/brno/mista" });
  });
});
