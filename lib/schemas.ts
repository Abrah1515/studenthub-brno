import { z } from "zod";
import { faculties } from "@/lib/universities";
import { communityCategories } from "@/lib/community-types";

const honeypot = z.string().max(0, "Spam byl rozpoznán.").optional();
const cityId = z.string().regex(/^[a-z0-9-]{2,80}$/).optional();

const serviceRequestObject = z.object({
  publicTitle: z.string().trim().min(4, "Uveďte krátký veřejný název.").max(120),
  name: z.string().trim().min(2, "Uveďte prosím jméno.").max(80),
  email: z.string().trim().email("Zadejte platný e-mail.").optional().or(z.literal("")),
  phone: z.string().trim().regex(/^[+\d\s()-]{7,20}$/, "Zadejte platný telefon.").optional().or(z.literal("")),
  serviceType: z.enum(["windows-linux", "cleaning", "ssd-ram", "backup", "wifi-printer", "device-choice", "other"]),
  description: z.string().trim().min(20, "Popište problém alespoň 20 znaky.").max(2000),
  location: z.string().trim().min(2, "Uveďte přibližnou lokalitu.").max(100),
  preferredDate: z.string().min(1, "Vyberte preferovaný termín."),
  consent: z.boolean().refine(Boolean, "Bez souhlasu nelze poptávku odeslat."),
  publishConsent: z.boolean().refine(Boolean, "Potvrďte zveřejnění popisu po schválení."),
  company: honeypot, cityId,
});

export const serviceRequestSchema = serviceRequestObject.superRefine((value, ctx) => { if (!value.email && !value.phone) ctx.addIssue({ code: "custom", path: ["email"], message: "Uveďte e-mail nebo telefon." }); });

export const serviceRequestUpdateSchema = serviceRequestObject.pick({ publicTitle: true, serviceType: true, description: true, location: true, preferredDate: true }).partial().refine((value) => Object.keys(value).length > 0, "Není co změnit.");

export const reportSchema = z.object({ targetType: z.enum(["service_request", "buddy_post", "community_event"]), targetId: z.string().uuid(), reason: z.enum(["spam", "harassment", "illegal", "privacy", "outdated", "other"]), detail: z.string().trim().max(800).default(""), cityId });

const safeHttpsUrl = z.string().url("Zadejte platný odkaz.").refine((value) => { try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; } }, "Odkaz musí používat bezpečné HTTPS.");

const communityEventFields = z.object({
  title: z.string().trim().min(4, "Doplňte název akce.").max(140),
  category: z.enum(["Kultura", "Sport", "Studium", "Zábava", "Ostatní"]),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).optional().or(z.literal("")),
  venue: z.string().trim().min(2, "Doplňte veřejné místo.").max(160),
  description: z.string().trim().min(20, "Popis musí mít alespoň 20 znaků.").max(2000),
  isFree: z.boolean(),
  priceAmount: z.coerce.number().min(0).max(100_000).optional(),
  eventUrl: safeHttpsUrl.optional().or(z.literal("")),
  authorEmail: z.string().trim().email("Zadejte platný e-mail.").max(254),
  publicVenueConsent: z.boolean().refine(Boolean, "Potvrďte, že nejde o soukromou adresu."),
  company: honeypot,
  cityId,
});

export const communityEventSchema = communityEventFields.superRefine((value, ctx) => {
  const starts = new Date(value.startsAt).getTime(); const ends = value.endsAt ? new Date(value.endsAt).getTime() : starts;
  if (starts < Date.now() + 15 * 60 * 1000) ctx.addIssue({ code: "custom", path: ["startsAt"], message: "Začátek musí být alespoň 15 minut v budoucnu." });
  if (starts > Date.now() + 550 * 24 * 60 * 60 * 1000) ctx.addIssue({ code: "custom", path: ["startsAt"], message: "Akci lze přidat nejvýše 18 měsíců dopředu." });
  if (ends < starts || ends > starts + 7 * 24 * 60 * 60 * 1000) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Konec musí následovat po začátku a být nejvýše za 7 dní." });
  if (value.isFree === false && value.priceAmount == null) ctx.addIssue({ code: "custom", path: ["priceAmount"], message: "Doplňte cenu, nebo označte akci jako zdarma." });
});

export const communityEventUpdateSchema = communityEventFields.omit({ authorEmail: true, publicVenueConsent: true, company: true, cityId: true }).partial().refine((value) => Object.keys(value).length > 0, "Není co změnit.");

export const buddyPostSchema = z.object({
  activityType: z.enum(["beer", "cinema", "sport", "culture", "study", "trip"]),
  approximateLocation: z.string().trim().min(2).max(100),
  startsAt: z.string().datetime({ offset: true }),
  description: z.string().trim().min(20).max(1200),
  maxParticipants: z.coerce.number().int().min(2).max(30),
  cityId,
  company: honeypot,
}).refine((value) => new Date(value.startsAt).getTime() > Date.now() + 30 * 60 * 1000, { path: ["startsAt"], message: "Termín musí být alespoň 30 minut v budoucnu." });

export const buddyPostUpdateSchema = z.object({
  approximateLocation: z.string().trim().min(2).max(100).optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  description: z.string().trim().min(20).max(1200).optional(),
  maxParticipants: z.coerce.number().int().min(2).max(30).optional(),
  status: z.enum(["active", "closed"]).optional(),
}).refine((value) => Object.keys(value).length > 0, "Není co změnit.")
  .refine((value) => !value.startsAt || new Date(value.startsAt).getTime() > Date.now() + 30 * 60 * 1000, { path: ["startsAt"], message: "Termín musí být alespoň 30 minut v budoucnu." });

export const buddyJoinSchema = z.object({ message: z.string().trim().max(500).default("") });

const optionalScope = {
  universityId: z.string().trim().max(50).optional().or(z.literal("")),
  facultyId: z.string().trim().max(80).optional().or(z.literal("")),
};
const validCommunityScope = (value: { universityId?: string; facultyId?: string }, ctx: z.RefinementCtx) => {
  if (value.facultyId && !faculties.some((faculty) => faculty.id === value.facultyId && faculty.universityId === value.universityId)) ctx.addIssue({ code: "custom", path: ["facultyId"], message: "Fakulta nepatří k vybrané univerzitě." });
};
export const communityPostSchema = z.object({
  nickname: z.string().trim().min(2, "Přezdívka musí mít alespoň 2 znaky.").max(40), category: z.enum(communityCategories),
  body: z.string().trim().min(2, "Napište alespoň krátkou otázku nebo tip.").max(500, "Příspěvek může mít nejvýše 500 znaků."),
  ...optionalScope, placeId: z.string().uuid("Vybrané místo není platné.").optional().or(z.literal("")), company: honeypot, cityId,
}).superRefine(validCommunityScope);
export const communityPostUpdateSchema = z.object({
  nickname: z.string().trim().min(2).max(40).optional(), category: z.enum(communityCategories).optional(), body: z.string().trim().min(2).max(500).optional(),
  ...optionalScope, placeId: z.string().uuid().optional().or(z.literal("")),
}).superRefine(validCommunityScope).refine((value) => Object.keys(value).length > 0, "Není co změnit.");
export const communityCommentSchema = z.object({ nickname: z.string().trim().min(2).max(40), body: z.string().trim().min(2).max(300), company: honeypot });
export const communityCommentUpdateSchema = z.object({ body: z.string().trim().min(2).max(300) });
export const communityReactionSchema = z.object({ targetType: z.enum(["post", "comment"]), targetId: z.string().uuid() });
export const communityReportSchema = z.object({ targetType: z.enum(["post", "comment"]), targetId: z.string().uuid(), reason: z.enum(["spam", "harassment", "hate", "privacy", "fraud", "dangerous", "other"]), detail: z.string().trim().max(800).default("") });

export const contactMessageSchema = z.object({
  name: z.string().trim().min(2, "Uveďte své jméno.").max(100),
  email: z.string().trim().email("Zadejte platný e-mail.").max(254),
  subject: z.string().trim().min(3, "Doplňte předmět.").max(160),
  message: z.string().trim().min(20, "Zpráva musí mít alespoň 20 znaků.").max(4000),
  company: honeypot,
  cityId,
});

export const jobSubmissionSchema = z.object({
  companyName: z.string().trim().min(2).max(120), title: z.string().trim().min(4).max(140), contactEmail: z.string().email(),
  location: z.string().trim().min(2).max(120), reward: z.coerce.number().int().min(100).max(5000), workload: z.string().trim().min(2).max(100),
  description: z.string().trim().min(30).max(2000), consent: z.boolean().refine(Boolean, "Potvrďte souhlas."), company: honeypot, cityId,
});

export const outboundClickSchema = z.object({
  targetType: z.enum(["offer", "job", "affiliate"]), targetId: z.string().min(1).max(100), destinationHost: z.string().min(1).max(253), cityId,
  universityId: z.string().max(50).nullable().optional(), facultyId: z.string().max(80).nullable().optional(), referralCode: z.string().regex(/^[a-z0-9-]{2,80}$/).nullable().optional(),
});

export const pageViewSchema = z.object({ path: z.string().startsWith("/").max(300).refine((path) => !path.includes("?") && !path.includes("#"), "Cesta nesmí obsahovat query ani fragment."), cityId, universityId: z.string().max(50).nullable().optional(), facultyId: z.string().max(80).nullable().optional(), referralCode: z.string().regex(/^[a-z0-9-]{2,80}$/).nullable().optional(), sessionId: z.string().uuid(), referrerDomain: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+$/).max(253).nullable().optional() });

export const contentSubmissionSchema = z.object({
  organizationName: z.string().trim().min(2, "Uveďte název spolku.").max(140), organizationType: z.enum(["student_club", "student_team", "community"]),
  universityId: z.enum(["muni", "vut", "mendelu", "vetuni", "jamu"]), facultyId: z.string().max(80).optional().or(z.literal("")),
  contentType: z.enum(["event", "offer", "place", "job"]), title: z.string().trim().min(4).max(180), description: z.string().trim().min(30).max(2500),
  sourceUrl: z.string().url("Zadejte veřejný odkaz.").optional().or(z.literal("")), contactEmail: z.string().email("Zadejte platný e-mail."), consent: z.boolean().refine(Boolean, "Potvrďte souhlas."), company: honeypot, cityId,
}).superRefine((value, ctx) => { if (value.facultyId && !faculties.some((faculty) => faculty.id === value.facultyId && faculty.universityId === value.universityId)) ctx.addIssue({ code: "custom", path: ["facultyId"], message: "Fakulta nepatří k vybrané univerzitě." }); });

export type ServiceRequestInput = z.infer<typeof serviceRequestSchema>;
export type JobSubmissionInput = z.infer<typeof jobSubmissionSchema>;
export type ContentSubmissionInput = z.infer<typeof contentSubmissionSchema>;
export type BuddyPostInput = z.infer<typeof buddyPostSchema>;
export type ContactMessageInput = z.infer<typeof contactMessageSchema>;
