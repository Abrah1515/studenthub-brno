import { describe, expect, it } from "vitest";
import { contentSubmissionSchema, jobSubmissionSchema, serviceRequestSchema } from "@/lib/schemas";

const validRequest = { name: "Jan Novák", email: "jan@example.cz", phone: "", serviceType: "backup", description: "Potřebuji bezpečně zazálohovat celý notebook.", preferredDate: "2026-08-10", consent: true, company: "" };

describe("validace poptávky", () => {
  it("přijme úplnou poptávku", () => expect(serviceRequestSchema.safeParse(validRequest).success).toBe(true));
  it("odmítne krátký popis", () => expect(serviceRequestSchema.safeParse({ ...validRequest, description: "Nefunguje" }).success).toBe(false));
  it("vyžaduje alespoň jeden kontakt", () => expect(serviceRequestSchema.safeParse({ ...validRequest, email: "", phone: "" }).success).toBe(false));
  it("odmítne vyplněný honeypot", () => expect(serviceRequestSchema.safeParse({ ...validRequest, company: "spam" }).success).toBe(false));
});

describe("validace návrhu brigády", () => {
  it("převede číselnou odměnu z formuláře", () => {
    const result = jobSubmissionSchema.safeParse({ companyName: "VoltLab", title: "Junior tester", contactEmail: "jobs@example.cz", location: "Brno", reward: "190", workload: "12 h týdně", description: "Testování zařízení a pečlivý zápis naměřených výsledků.", consent: true, company: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.reward).toBe(190);
  });
});

describe("validace komunitního obsahu", () => {
  const valid = { organizationName: "Studentský spolek", organizationType: "student_club", universityId: "vut", facultyId: "vut-fekt", contentType: "event", title: "Veřejná technická přednáška", description: "Veřejná přednáška s ověřitelným programem a odkazem na pořadatele.", sourceUrl: "https://www.fekt.vut.cz/", contactEmail: "spolek@example.cz", consent: true, company: "" };
  it("přijme VUT + FEKT a zachová obě ID", () => { const result = contentSubmissionSchema.safeParse(valid); expect(result.success).toBe(true); if (result.success) expect(result.data).toMatchObject({ universityId: "vut", facultyId: "vut-fekt" }); });
  it("odmítne fakultu cizí univerzity a honeypot", () => { expect(contentSubmissionSchema.safeParse({ ...valid, universityId: "muni" }).success).toBe(false); expect(contentSubmissionSchema.safeParse({ ...valid, company: "bot" }).success).toBe(false); });
});
