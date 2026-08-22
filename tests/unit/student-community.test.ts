import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { communityCommentSchema, communityPostSchema, communityReportSchema } from "@/lib/schemas";

let helpers: typeof import("@/lib/community");
beforeAll(async () => { helpers = await import("@/lib/community"); });

describe("Studentská komunita", () => {
  const valid = { nickname: "Ada", category: "Studium", body: "Jak nejlépe procvičit matematiku?", universityId: "vut", facultyId: "vut-fekt", placeId: "", company: "", cityId: "brno" };
  it("validuje rozsah školy, honeypot a délku příspěvku", () => { expect(communityPostSchema.safeParse(valid).success).toBe(true); expect(communityPostSchema.safeParse({ ...valid, facultyId: "muni-fi" }).success).toBe(false); expect(communityPostSchema.safeParse({ ...valid, company: "robot" }).success).toBe(false); expect(communityPostSchema.safeParse({ ...valid, body: "x".repeat(501) }).success).toBe(false); });
  it("omezuje komentář na 300 znaků a zná moderátorské důvody", () => { expect(communityCommentSchema.safeParse({ nickname: "Ada", body: "Užitečná odpověď", company: "" }).success).toBe(true); expect(communityCommentSchema.safeParse({ nickname: "Ada", body: "x".repeat(301), company: "" }).success).toBe(false); expect(communityReportSchema.safeParse({ targetType: "post", targetId: "11111111-1111-4111-8111-111111111111", reason: "hate", detail: "" }).success).toBe(true); });
  it("odmítá zjevný e-mail a telefon ve veřejném textu", () => { expect(helpers.containsPersonalContact("Napište mi na student@example.cz.")).toBe(true); expect(helpers.containsPersonalContact("Telefon: +420 777 123 456.")).toBe(true); expect(helpers.containsPersonalContact("Sejdeme se v roce 2026 u knihovny")).toBe(false); });
  it("zachytí základní automatický spam", () => { expect(helpers.looksLikeCommunitySpam("https://a.cz https://b.cz https://c.cz https://d.cz")).toBe(true); expect(helpers.looksLikeCommunitySpam("Skvělýýýýýýýýýýýýý tip")).toBe(true); expect(helpers.looksLikeCommunitySpam("Jeden bezpečný odkaz https://example.cz")).toBe(false); });
  it("normalizuje duplicity a nikdy neserializuje e-mail ani id autora", () => { expect(helpers.communityFingerprint("user", "Příliš  ŽLUŤOUČKÝ")).toBe(helpers.communityFingerprint("user", "prilis zlutoucky")); const item = helpers.publicCommunityPost({ id: "post", author_id: "secret-user-id", author_email: "private@example.cz", author_nickname: "Ada", category: "Studium", body: "Text", helpful_count: 1, comment_count: 2, created_at: "2026-08-17T10:00:00Z", updated_at: "2026-08-17T10:00:00Z" }); expect(item).not.toHaveProperty("authorId"); expect(item).not.toHaveProperty("email"); expect(JSON.stringify(item)).not.toContain("private@example.cz"); });
  it("odmítá nepovolený typ a velikost obrázku", () => { expect(() => helpers.validateCommunityImage({ type: "image/gif", size: 20 })).toThrow(/JPEG/); expect(() => helpers.validateCommunityImage({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toThrow(/5 MB/); expect(() => helpers.validateCommunityImage({ type: "image/webp", size: 1000 })).not.toThrow(); });
});
