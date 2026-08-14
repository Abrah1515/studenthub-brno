import { describe, expect, it } from "vitest";
import { academicEventMatchesSelection } from "@/lib/academic-events";
import { normalizePreference } from "@/lib/client-preferences";
import { contentSources } from "@/lib/sources/registry";
import { faculties, fallbackAcademicCatalog, resolveStudySelection, universities } from "@/lib/universities";
import type { AcademicEvent } from "@/lib/types";
import { filterAcademicEvents, filterJobs, filterOffers, filterPlaces } from "@/lib/personalization";
import type { Job, Offer, Place } from "@/lib/types";

const event = (scope: AcademicEvent["scope"], universityId?: string, facultyId?: string): AcademicEvent => ({ id: `${scope}-${facultyId || universityId || "city"}`, title: "Termín", category: "Výuka", school: universityId || "Brno", faculty: facultyId || "Všechny fakulty", start: "2026-09-14T00:00:00+02:00", source: "Oficiální zdroj", sourceUrl: "https://example.edu/", updatedAt: "2026-08-02", lastVerifiedAt: "2026-08-02", description: "Test rozsahu", scope, universityId, facultyId });

describe("stabilní katalog fakult", () => {
  it("obsahuje 27 aktivních a oficiálně odkazovaných fakult", () => { expect(universities).toHaveLength(5); expect(faculties).toHaveLength(27); expect(faculties.every((faculty) => faculty.active && faculty.slug === faculty.id && faculty.officialUrl.startsWith("https://"))).toBe(true); });
  it("má právě jeden registrovaný akademický zdroj pro každou fakultu", () => { const academicSources = contentSources.filter((source) => source.sourceType === "academic_calendar"); expect(new Set(academicSources.map((source) => source.facultyId))).toEqual(new Set(faculties.map((faculty) => faculty.id))); expect(contentSources.every((source) => source.notes && source.officialDomain)).toBe(true); });
});

describe("validace výběru", () => {
  it("odmítne fakultu jiné univerzity", () => { expect(resolveStudySelection("muni", "vut-fit")).toEqual({ universityId: "muni", facultyId: "" }); expect(normalizePreference({ universityId: "muni", facultyId: "vut-fit", completed: true }, fallbackAcademicCatalog)).toMatchObject({ universityId: "muni", facultyId: null }); });
  it("odmítne neznámou školu i interní ID", () => { expect(resolveStudySelection("unknown", "muni-fi")).toEqual({ universityId: "", facultyId: "" }); });
});

describe("sjednocení univerzitních a fakultních termínů", () => {
  const events = [event("city"), event("university", "muni"), event("faculty", "muni", "muni-fi"), event("faculty", "muni", "muni-fss"), event("faculty", "vut", "vut-fit")];
  it("pro FI zobrazí město, MUNI a FI, ale ne FSS ani VUT", () => { expect(events.filter((item) => academicEventMatchesSelection(item, { universityId: "muni", facultyId: "muni-fi" })).map((item) => item.id)).toEqual(["city-city", "university-muni", "faculty-muni-fi"]); });
  it("bez fakulty zobrazí všechny termíny vybrané univerzity", () => { expect(events.filter((item) => academicEventMatchesSelection(item, { universityId: "muni" }))).toHaveLength(4); });
});

describe("stejný scope pro všechny dashboardové kolekce", () => {
  const selection = { universityId: "muni", facultyId: "muni-fi" };
  it("nepropustí VUT ani jinou fakultu do žádné kolekce", () => {
    const events = [event("city"), event("university", "muni"), event("faculty", "muni", "muni-fi"), event("faculty", "vut", "vut-fit")];
    const place = (id: string, universityIds?: string[], facultyIds?: string[]): Place => ({ id, name: id, category: "Studovna", address: "Brno", website: "https://example.cz", sourceUrl: "https://example.cz", lastVerifiedAt: "2026-08-02", verificationStatus: "verified", lat: 49.2, lng: 16.6, note: "", universityIds, facultyIds });
    const offer = (id: string, universityIds?: string[], facultyIds?: string[]): Offer => ({ id, title: id, category: "Kultura", partner: "Partner", discount: "10 %", validTo: "2027-01-01", conditions: "", url: "https://example.cz", sourceUrl: "https://example.cz", lastVerifiedAt: "2026-08-02", requiresIsic: false, sponsored: false, affiliate: false, featured: false, universityIds, facultyIds });
    const job = (id: string, universityIds?: string[], facultyIds?: string[]): Job => ({ id, title: id, company: "Firma", field: "IT", type: "DPP", location: "Brno", reward: 180, workload: "10 h", lastVerifiedAt: "2026-08-02", description: "", featured: false, status: "approved", universityIds, facultyIds });
    expect(filterAcademicEvents(events, selection).map((item) => item.id)).toEqual(["city-city", "university-muni", "faculty-muni-fi"]);
    expect(filterPlaces([place("city"), place("fi", ["muni"], ["muni-fi"]), place("fit", ["vut"], ["vut-fit"])], selection).map((item) => item.id)).toEqual(["city", "fi"]);
    expect(filterOffers([offer("city"), offer("fi", ["muni"], ["muni-fi"]), offer("fit", ["vut"], ["vut-fit"])], selection).map((item) => item.id)).toEqual(["city", "fi"]);
    expect(filterJobs([job("city"), job("fi", ["muni"], ["muni-fi"]), job("fit", ["vut"], ["vut-fit"])], selection).map((item) => item.id)).toEqual(["city", "fi"]);
  });
});
