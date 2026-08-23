import { z } from "zod";
import { faculties } from "@/lib/universities";
import { communityCategories } from "@/lib/community-types";

const honeypot = z.string().max(0, "Spam byl rozpoznán.").optional();
const cityId = z.string().regex(/^[a-z0-9-]{2,80}$/).optional();

const serviceRequestObject = z.object({
  publicTitle: z.string().trim().min(4, "Uveďte krátký veřejný název.").max(120),
  publicAlias: z.string().trim().min(2, "Uveďte přezdívku pro veřejnou část.").max(60),
  name: z.string().trim().min(2, "Uveďte prosím jméno.").max(80),
  email: z.string().trim().email("Zadejte platný e-mail.").optional().or(z.literal("")),
  phone: z.string().trim().regex(/^[+\d\s()-]{7,20}$/, "Zadejte platný telefon.").optional().or(z.literal("")),
  serviceType: z.enum(["windows-linux", "cleaning", "ssd-ram", "backup", "wifi-printer", "device-choice", "other"]),
  description: z.string().trim().min(20, "Popište problém alespoň 20 znaky.").max(2000),
  location: z.string().trim().min(2, "Uveďte přibližnou lokalitu.").max(100),
  preferredDate: z.string().min(1, "Vyberte preferovaný termín."),
  consent: z.boolean().refine(Boolean, "Bez souhlasu nelze poptávku odeslat."),
  publishConsent: z.boolean().refine(Boolean, "Potvrďte okamžité zveřejnění veřejné části žádosti."),
  company: honeypot, cityId,
});

export const serviceRequestSchema = serviceRequestObject.superRefine((value, ctx) => {
  if (!value.email && !value.phone) ctx.addIssue({ code: "custom", path: ["email"], message: "Uveďte e-mail nebo telefon." });
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value.description) || /(?:\+?420\s*)?(?:\d[\s-]*){9}/.test(value.description)) ctx.addIssue({ code: "custom", path: ["description"], message: "Do veřejného popisu neuvádějte e-mail ani telefon." });
});

export const serviceRequestUpdateSchema = serviceRequestObject.pick({ publicTitle: true, publicAlias: true, serviceType: true, description: true, location: true, preferredDate: true }).partial()
  .refine((value) => Object.keys(value).length > 0, "Není co změnit.")
  .refine((value) => !value.description || (!/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value.description) && !/(?:\+?420\s*)?(?:\d[\s-]*){9}/.test(value.description)), { path: ["description"], message: "Do veřejného popisu neuvádějte e-mail ani telefon." });

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

export const savedItemSchema = z.object({
  targetType: z.enum(["academic_event", "community_event"]), targetId: z.string().uuid(),
  favorite: z.boolean().optional(), watched: z.boolean().optional(),
  reminderDays: z.array(z.union([z.literal(0), z.literal(1), z.literal(3), z.literal(7)])).min(1).max(4).optional(),
  snapshot: z.object({ title: z.string().trim().min(3).max(180), start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }).optional(), url: z.string().startsWith("/").max(300) }),
  preference: z.object({ cityId: z.string().regex(/^[a-z0-9-]{2,80}$/), universityId: z.string().max(50).nullable().optional(), facultyId: z.string().max(80).nullable().optional(), studyYear: z.number().int().min(1).max(6).nullable().optional() }).optional(),
}).refine((value) => value.favorite !== undefined || value.watched !== undefined || value.reminderDays !== undefined, "Není co uložit.");

export const watcherMutableCategories = [
  "teaching", "holiday", "registration", "other", "semester_start", "semester_end",
  "course_registration", "course_enrollment", "seminar_enrollment", "enrollment_changes",
  "timetable_release", "exam", "final_exam_application", "final_exam", "thesis_deadline",
  "matriculation", "graduation", "faculty_event", "internship", "dean_rector_leave",
] as const;
export const watcherMutedCategoriesSchema = z.object({
  mutedCategories: z.array(z.enum(watcherMutableCategories)).max(watcherMutableCategories.length),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().startsWith("https://").max(2000), expirationTime: z.number().int().positive().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(20).max(500), auth: z.string().min(8).max(500) }),
});

export const calendarSubscriptionSchema = z.object({
  cityId: z.string().regex(/^[a-z0-9-]{2,80}$/).default("brno"), universityId: z.string().max(50).optional().or(z.literal("")),
  facultyId: z.string().max(80).optional().or(z.literal("")), studyYear: z.number().int().min(1).max(6).optional(), category: z.string().max(80).optional().or(z.literal("")),
}).superRefine(validCommunityScope);

export const placeLiveReportSchema = z.object({
  status: z.enum(["no_queue", "short_queue", "long_queue", "closed", "many_seats", "partly_occupied", "almost_full"]),
  proximityBand: z.enum(["near", "unknown"]).optional().default("unknown"),
});

const marketplaceScope = z.object({
  universityId: z.string().trim().max(50).optional().or(z.literal("")),
  facultyId: z.string().trim().max(80).optional().or(z.literal("")),
});

export const marketplaceListingSchema = z.object({
  listingType: z.enum(["offer", "wanted"]),
  category: z.enum(["textbook", "scripts", "own_notes", "study_materials", "calculator_equipment", "other"]),
  title: z.string().trim().min(4, "Název musí mít alespoň 4 znaky.").max(140),
  shortDescription: z.string().trim().min(10, "Krátký popis musí mít alespoň 10 znaků.").max(240),
  description: z.string().trim().min(30, "Úplný popis musí mít alespoň 30 znaků.").max(3000),
  priceMode: z.enum(["fixed", "free", "negotiable"]),
  priceAmount: z.coerce.number().int("Cena musí být celé číslo.").min(0).max(1_000_000).optional(),
  priceScope: z.enum(["item", "bundle"]),
  ...marketplaceScope.shape,
  studyProgram: z.string().trim().max(140).optional().or(z.literal("")),
  subjectName: z.string().trim().max(140).optional().or(z.literal("")),
  subjectCode: z.string().trim().max(40).optional().or(z.literal("")),
  teacherName: z.string().trim().max(120).optional().or(z.literal("")),
  recommendedYear: z.coerce.number().int().min(1).max(6).optional(),
  semester: z.enum(["winter", "summer", "both", "not_applicable"]),
  academicYear: z.string().trim().regex(/^20\d{2}\/20\d{2}$/, "Použijte formát 2026/2027.").optional().or(z.literal("")),
  materialFormat: z.enum(["printed", "digital", "both"]),
  itemCondition: z.enum(["new", "like_new", "used", "worn"]).optional().or(z.literal("")),
  handoffMethod: z.enum(["in_person", "shipping", "digital", "agreement"]),
    handoffLocation: z.string().trim().min(2, "Místo předání musí mít alespoň 2 znaky.").max(120).optional().or(z.literal("")),
  publicAlias: z.string().trim().min(2, "Přezdívka musí mít alespoň 2 znaky.").max(50),
  sellerEmail: z.string().trim().email("Zadejte platný e-mail.").max(254),
  copyrightConfirmed: z.boolean().refine(Boolean, "Potvrďte právo nabízený obsah zveřejnit."),
  ownNotesConfirmed: z.boolean().default(false),
  privacyConsent: z.boolean().refine(Boolean, "Potvrďte zpracování kontaktního e-mailu."),
  company: honeypot,
  cityId,
}).superRefine((value, ctx) => {
  validCommunityScope(value, ctx);
  if (value.priceMode === "fixed" && value.priceAmount == null) ctx.addIssue({ code: "custom", path: ["priceAmount"], message: "Doplňte cenu v Kč." });
  if (value.priceMode === "free" && value.priceAmount != null && value.priceAmount !== 0) ctx.addIssue({ code: "custom", path: ["priceAmount"], message: "Bezplatný inzerát musí mít cenu 0 Kč." });
  if (value.priceMode === "negotiable" && value.listingType !== "wanted") ctx.addIssue({ code: "custom", path: ["priceMode"], message: "Cenu dohodou lze použít pouze u inzerátu Hledám." });
  if (value.materialFormat === "digital" && value.itemCondition) ctx.addIssue({ code: "custom", path: ["itemCondition"], message: "Digitální materiál nemá fyzický stav." });
  if (value.materialFormat !== "digital" && !value.itemCondition) ctx.addIssue({ code: "custom", path: ["itemCondition"], message: "Doplňte stav fyzického předmětu." });
  if (["in_person", "agreement"].includes(value.handoffMethod) && !value.handoffLocation) ctx.addIssue({ code: "custom", path: ["handoffLocation"], message: "Doplňte přibližné místo předání." });
  if (value.category === "own_notes" && !value.ownNotesConfirmed) ctx.addIssue({ code: "custom", path: ["ownNotesConfirmed"], message: "Potvrďte autorství vlastních poznámek." });
});

export const marketplaceListingUpdateSchema = z.object({
  action: z.enum(["update", "reserve", "sold", "reopen", "renew"]),
  title: z.string().trim().min(4).max(140).optional(),
  shortDescription: z.string().trim().min(10).max(240).optional(),
  description: z.string().trim().min(30).max(3000).optional(),
  priceMode: z.enum(["fixed", "free", "negotiable"]).optional(),
  priceAmount: z.number().int().min(0).max(1_000_000).nullable().optional(),
  priceScope: z.enum(["item", "bundle"]).optional(),
  handoffMethod: z.enum(["in_person", "shipping", "digital", "agreement"]).optional(),
    handoffLocation: z.string().trim().min(2).max(120).optional().or(z.literal("")),
}).refine((value) => value.action !== "update" || Object.keys(value).some((key) => key !== "action"), "Není co změnit.");

export const marketplaceVerificationSchema = z.object({ verificationToken: z.string().regex(/^[a-f0-9]{64}$/), managementToken: z.string().regex(/^[a-f0-9]{64}$/) });
export const marketplaceContactSchema = z.object({ buyerEmail: z.string().trim().email("Zadejte platný e-mail.").max(254), message: z.string().trim().min(20, "Zpráva musí mít alespoň 20 znaků.").max(2000), consent: z.boolean().refine(Boolean, "Potvrďte předání zprávy prodávajícímu."), company: honeypot });
export const marketplaceReportSchema = z.object({ reason: z.enum(["fraud", "copyright", "academic_integrity", "illegal", "sold", "privacy", "spam", "other"]), detail: z.string().trim().max(1000).default(""), company: honeypot });

export type ServiceRequestInput = z.infer<typeof serviceRequestSchema>;
export type JobSubmissionInput = z.infer<typeof jobSubmissionSchema>;
export type ContentSubmissionInput = z.infer<typeof contentSubmissionSchema>;
export type BuddyPostInput = z.infer<typeof buddyPostSchema>;
export type ContactMessageInput = z.infer<typeof contactMessageSchema>;
export type MarketplaceListingFormInput = z.input<typeof marketplaceListingSchema>;
export type MarketplaceListingInput = z.infer<typeof marketplaceListingSchema>;
