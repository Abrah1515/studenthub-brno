import { z } from "zod";
import { faculties } from "@/lib/universities";

const honeypot = z.string().max(0, "Spam byl rozpoznán.").optional();
const cityId = z.string().regex(/^[a-z0-9-]{2,80}$/).optional();

export const serviceRequestSchema = z.object({
  name: z.string().trim().min(2, "Uveďte prosím jméno.").max(80),
  email: z.string().trim().email("Zadejte platný e-mail.").optional().or(z.literal("")),
  phone: z.string().trim().regex(/^[+\d\s()-]{7,20}$/, "Zadejte platný telefon.").optional().or(z.literal("")),
  serviceType: z.enum(["windows-linux", "cleaning", "ssd-ram", "backup", "wifi-printer", "device-choice", "other"]),
  description: z.string().trim().min(20, "Popište problém alespoň 20 znaky.").max(2000),
  preferredDate: z.string().min(1, "Vyberte preferovaný termín."),
  consent: z.boolean().refine(Boolean, "Bez souhlasu nelze poptávku odeslat."),
  company: honeypot, cityId,
}).superRefine((value, ctx) => { if (!value.email && !value.phone) ctx.addIssue({ code: "custom", path: ["email"], message: "Uveďte e-mail nebo telefon." }); });

export const jobSubmissionSchema = z.object({
  companyName: z.string().trim().min(2).max(120), title: z.string().trim().min(4).max(140), contactEmail: z.string().email(),
  location: z.string().trim().min(2).max(120), reward: z.coerce.number().int().min(100).max(5000), workload: z.string().trim().min(2).max(100),
  description: z.string().trim().min(30).max(2000), consent: z.boolean().refine(Boolean, "Potvrďte souhlas."), company: honeypot, cityId,
});

export const outboundClickSchema = z.object({
  targetType: z.enum(["offer", "job", "affiliate"]), targetId: z.string().min(1).max(100), destinationHost: z.string().min(1).max(253), cityId,
  universityId: z.string().max(50).nullable().optional(), facultyId: z.string().max(80).nullable().optional(), referralCode: z.string().regex(/^[a-z0-9-]{2,80}$/).nullable().optional(),
});

export const pageViewSchema = z.object({ path: z.string().startsWith("/").max(300), cityId, universityId: z.string().max(50).nullable().optional(), facultyId: z.string().max(80).nullable().optional(), referralCode: z.string().regex(/^[a-z0-9-]{2,80}$/).nullable().optional() });

export const contentSubmissionSchema = z.object({
  organizationName: z.string().trim().min(2, "Uveďte název spolku.").max(140), organizationType: z.enum(["student_club", "student_team", "community"]),
  universityId: z.enum(["muni", "vut", "mendelu", "vetuni", "jamu"]), facultyId: z.string().max(80).optional().or(z.literal("")),
  contentType: z.enum(["event", "offer", "place", "job"]), title: z.string().trim().min(4).max(180), description: z.string().trim().min(30).max(2500),
  sourceUrl: z.string().url("Zadejte veřejný odkaz.").optional().or(z.literal("")), contactEmail: z.string().email("Zadejte platný e-mail."), consent: z.boolean().refine(Boolean, "Potvrďte souhlas."), company: honeypot, cityId,
}).superRefine((value, ctx) => { if (value.facultyId && !faculties.some((faculty) => faculty.id === value.facultyId && faculty.universityId === value.universityId)) ctx.addIssue({ code: "custom", path: ["facultyId"], message: "Fakulta nepatří k vybrané univerzitě." }); });

export type ServiceRequestInput = z.infer<typeof serviceRequestSchema>;
export type JobSubmissionInput = z.infer<typeof jobSubmissionSchema>;
export type ContentSubmissionInput = z.infer<typeof contentSubmissionSchema>;
