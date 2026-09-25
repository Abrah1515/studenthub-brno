import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { classifyAcademicDocumentCandidate, discoverAcademicDocument } from "@/lib/sources/discovery";
import { parsePdf } from "@/lib/sources/connectors/pdf";
import { isSubjectExamPlanText, parseSubjectExamPlanText, PUBLIC_PLAN_NOTICE } from "@/lib/sources/connectors/subject-exam-plan";
import { contentSources } from "@/lib/sources/registry";
import { reconcileEvents } from "@/lib/sources/reconcile";
import type { ContentSource } from "@/lib/sources/types";

const fekt = contentSources.find((source) => source.id === "src-vut-fekt")!;
const checkedAt = "2026-09-25T10:00:00.000Z";

async function fixture() {
  return readFile("tests/fixtures/fekt-exam-plan-2026-27.txt", "utf8");
}

describe("objevování veřejných plánů konkrétních zkoušek", () => {
  it("najde oficiální FEKT dokument i bez přípony PDF", () => {
    const url = "https://www.vut.cz/uredni-deska/vnitrni-legislativa-fekt/-d363098/casovy-plan-zkousek-zs-2026-27-p375964";
    const html = `<a href="${url}">Časový plán zkoušek ZS 2026/27</a>`;
    expect(discoverAcademicDocument(html, fekt.sourceUrl, fekt, new Date(checkedAt))).toMatchObject({ url, academicYear: "2026/2027", kind: "subject_exams" });
  });

  it("rozliší předmětové, státní a přijímací zkoušky", () => {
    expect(classifyAcademicDocumentCandidate("Časový plán zkoušek předmětů ZS 2026/27")).toBe("subject_exams");
    expect(classifyAcademicDocumentCandidate("Termíny státních závěrečných zkoušek SZZ")).toBe("final_exams");
    expect(classifyAcademicDocumentCandidate("Harmonogram přijímacích zkoušek 2027")).toBe("admissions");
    expect(isSubjectExamPlanText("Přijímací zkoušky – termín zkoušky uchazečů")).toBe(false);
  });
});

describe("parser veřejného fakultního plánu zkoušek", () => {
  it("zpracuje ročníky, skupiny předmětů a správné roky termínů", async () => {
    const result = await parseSubjectExamPlanText(await fixture(), { source: fekt, body: new Uint8Array(), contentType: "text/plain", checkedAt });
    expect(result).not.toBeNull();
    const events = result!.events;
    const el1 = events.filter((event) => event.title.startsWith("BPC-EL1"));
    expect(el1.map((event) => event.startAt.slice(0, 10))).toEqual(["2027-01-07", "2027-01-17", "2027-01-24"]);
    expect(el1.map((event) => event.studyYears)).toEqual([[1], [1], [1]]);
    const december = events.find((event) => event.title.startsWith("BPC-MA1(B)") && event.title.includes("1. termín"));
    expect(december?.startAt.slice(0, 10)).toBe("2026-12-14");
    const grouped = events.filter((event) => event.title.startsWith("BPC-MA3, BPC-MA3A, BPC-FY2"));
    expect(grouped).toHaveLength(3);
    expect(grouped.every((event) => event.studyYears?.[0] === 2)).toBe(true);
    expect(events.find((event) => event.title.includes("nejzazší termín zápočtu"))?.startAt.slice(0, 10)).toBe("2026-12-15");
    expect(events.every((event) => event.description.includes(PUBLIC_PLAN_NOTICE))).toBe(true);
  });

  it("má stabilní identity a opakovaný import nevytvoří duplicity", async () => {
    const context = { source: fekt, body: new Uint8Array(), contentType: "text/plain", checkedAt };
    const first = (await parseSubjectExamPlanText(await fixture(), context))!.events;
    const second = (await parseSubjectExamPlanText(await fixture(), context))!.events;
    expect(new Set(first.map((event) => event.externalId)).size).toBe(first.length);
    expect(second.map((event) => event.externalId)).toEqual(first.map((event) => event.externalId));
    const existing = first.map((event, index) => ({ id: String(index), external_id: event.externalId, source_hash: event.sourceHash, manual_override: false, starts_at: event.startAt, title: event.title, is_cancelled: false }));
    expect(reconcileEvents(existing, second).inserts).toHaveLength(0);
  });

  it("starý rok nepublikuje automaticky", async () => {
    const oldText = (await fixture())
      .replaceAll("2026/27", "2025/26")
      .replaceAll("Termín zkoušky 2027", "Termín zkoušky 2026")
      .replaceAll("15.12.2026", "15.12.2025")
      .replaceAll("16.12.2026", "16.12.2025")
      .replace("Brno 1. 9. 2026", "Brno 1. 9. 2025");
    const source = { ...fekt, academicYear: null } satisfies ContentSource;
    const result = await parseSubjectExamPlanText(oldText, { source, body: new Uint8Array(), contentType: "text/plain", checkedAt });
    expect(result!.events.every((event) => event.status === "pending")).toBe(true);
    expect(result!.warnings.join(" ")).toContain("očekáván je 2026/2027");
  });

  it("změna data aktualizuje existující identitu místo vložení duplikátu", async () => {
    const original = (await parseSubjectExamPlanText(await fixture(), { source: fekt, body: new Uint8Array(), contentType: "text/plain", checkedAt }))!.events;
    const changedText = (await fixture()).replace("BPC-EL1 | 8.1.", "BPC-EL1 | 9.1.");
    const changed = (await parseSubjectExamPlanText(changedText, { source: fekt, body: new Uint8Array(), contentType: "text/plain", checkedAt }))!.events;
    const first = original.find((event) => event.title === "BPC-EL1 – 1. termín zkoušky")!;
    const replacement = changed.find((event) => event.title === first.title)!;
    expect(replacement.externalId).toBe(first.externalId);
    expect(replacement.sourceHash).not.toBe(first.sourceHash);
  });

  it("přijme platné PDF podle signatury i při chybném MIME", async () => {
    const pdf = await readFile("tests/fixtures/calendar-text.pdf");
    const source = { ...fekt, sourceUrl: "https://www.vut.cz/document/opaque", format: "pdf" as const, academicYear: "2026/2027" };
    await expect(parsePdf({ source, body: Uint8Array.from(pdf), contentType: "text/plain", checkedAt })).resolves.toMatchObject({ extractionMethod: "native_text" });
  });
});

it("chybějící zdroj nevytváří falešný termín", async () => {
  const result = await parseSubjectExamPlanText("Veřejný zdroj zatím nenalezen", { source: fekt, body: new Uint8Array(), contentType: "text/plain", checkedAt });
  expect(result).toBeNull();
});
