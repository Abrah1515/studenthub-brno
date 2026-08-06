import { describe, expect, it } from "vitest";
import { buddyPostSchema, contactMessageSchema, contentSubmissionSchema, jobSubmissionSchema, pageViewSchema, reportSchema, serviceRequestSchema, serviceRequestUpdateSchema } from "@/lib/schemas";

const validRequest = { publicTitle: "Pomoc se zálohou notebooku", name: "Jan Novák", email: "jan@example.cz", phone: "", serviceType: "backup", description: "Potřebuji bezpečně zazálohovat celý notebook.", location: "Brno-střed", preferredDate: "2026-08-10", consent: true, publishConsent: true, company: "" };

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

describe("validace kontaktní zprávy", () => {
  const valid = { name: "Adam Novák", email: "adam@example.cz", subject: "Oprava údaje", message: "Na stránce místa je potřeba upravit provozní dobu.", company: "", cityId: "brno" };
  it("přijme úplnou zprávu", () => expect(contactMessageSchema.safeParse(valid).success).toBe(true));
  it("odmítne heslo v honeypotu a neplatný e-mail", () => { expect(contactMessageSchema.safeParse({ ...valid, company: "robot" }).success).toBe(false); expect(contactMessageSchema.safeParse({ ...valid, email: "neplatny" }).success).toBe(false); });
});

describe("validace komunitního obsahu", () => {
  const valid = { organizationName: "Studentský spolek", organizationType: "student_club", universityId: "vut", facultyId: "vut-fekt", contentType: "event", title: "Veřejná technická přednáška", description: "Veřejná přednáška s ověřitelným programem a odkazem na pořadatele.", sourceUrl: "https://www.fekt.vut.cz/", contactEmail: "spolek@example.cz", consent: true, company: "" };
  it("přijme VUT + FEKT a zachová obě ID", () => { const result = contentSubmissionSchema.safeParse(valid); expect(result.success).toBe(true); if (result.success) expect(result.data).toMatchObject({ universityId: "vut", facultyId: "vut-fekt" }); });
  it("odmítne fakultu cizí univerzity a honeypot", () => { expect(contentSubmissionSchema.safeParse({ ...valid, universityId: "muni" }).success).toBe(false); expect(contentSubmissionSchema.safeParse({ ...valid, company: "bot" }).success).toBe(false); });
});

describe("validace veřejné pomoci, parťáků a soukromé analytiky", () => {
  it("povolí jen bezpečně omezenou úpravu vlastní žádosti", () => { expect(serviceRequestUpdateSchema.safeParse({ publicTitle: "Opravený veřejný název" }).success).toBe(true); expect(serviceRequestUpdateSchema.safeParse({}).success).toBe(false); expect(serviceRequestUpdateSchema.safeParse({ email: "cizi@example.cz" }).success).toBe(false); });
  it("odmítne minulý termín a vyplněný honeypot parťáka", () => { const valid = { activityType: "study", approximateLocation: "Brno-střed", startsAt: new Date(Date.now() + 86_400_000).toISOString(), description: "Společné učení v knihovně na zkoušku z matematiky.", maxParticipants: 4, company: "" }; expect(buddyPostSchema.safeParse(valid).success).toBe(true); expect(buddyPostSchema.safeParse({ ...valid, startsAt: "2020-01-01T10:00:00.000Z" }).success).toBe(false); expect(buddyPostSchema.safeParse({ ...valid, company: "robot" }).success).toBe(false); });
  it("nepovolí analytice query, fragment ani celý referrer", () => { const valid = { path: "/brno/partak", cityId: "brno", sessionId: "11111111-1111-4111-8111-111111111111", referrerDomain: "studentsky-spolek.cz" }; expect(pageViewSchema.safeParse(valid).success).toBe(true); expect(pageViewSchema.safeParse({ ...valid, path: "/brno?email=test" }).success).toBe(false); expect(pageViewSchema.safeParse({ ...valid, referrerDomain: "https://example.cz/path?q=1" }).success).toBe(false); });
  it("hlášení vyžaduje známý typ, důvod a UUID", () => { expect(reportSchema.safeParse({ targetType: "buddy_post", targetId: "11111111-1111-4111-8111-111111111111", reason: "privacy", detail: "Obsah zveřejňuje osobní údaj.", cityId: "brno" }).success).toBe(true); expect(reportSchema.safeParse({ targetType: "offer", targetId: "neni-uuid", reason: "other" }).success).toBe(false); });
});
