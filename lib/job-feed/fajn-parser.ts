import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { Job, JobRewardUnit } from "@/lib/types";
import { sha256 } from "@/lib/sources/normalize";

type XmlRecord = Record<string, unknown>;
export type ParsedFajnJob = {
  externalId: string; title: string; company?: string; description: string; field: Job["field"]; workType: Job["type"];
  location: string; applyUrl: string; salaryMin?: number; salaryMax?: number; salaryCurrency?: Job["rewardCurrency"];
  salaryUnit?: JobRewardUnit; workload: string; workloadCodes: string[]; benefitCodes: string[]; countryExternalId?: string;
  cityExternalId?: string; positionExternalId?: string; positionsCount?: number; durationDays?: number; sourceHash: string;
};
export type FajnParseResult = { jobs: ParsedFajnJob[]; rejected: number; warnings: string[] };

const allowedDetailHosts = new Set(["fajn-brigady.cz", "www.fajn-brigady.cz", "fajn-brigady.sk", "www.fajn-brigady.sk", "inwork.cz", "www.inwork.cz"]);
const currencies: Record<string, Job["rewardCurrency"]> = { "1": "CZK", "2": "EUR", "3": "USD", "4": "GBP" };
const salaryUnits: Record<string, JobRewardUnit> = { "1": "hour", "2": "month", "28": "day", "29": "agreement", "30": "fixed", "31": "volunteer" };
const itPositions = new Set([140, 141, 143, 144, 145, 146, 147, 392, 393, 395, 396, 408, 425]);
const electricalPositions = new Set([128, 129, 130, 131, 133, 134, 135, 136, 137, 138, 139, 311, 370, 375, 377, 411, 416, 433, 464]);
const adminPositions = new Set([1, 2, 4, 5, 6, 7, 8, 10, 315, 437, 492]);
const gastroPositions = new Set([283, 284, 285, 286, 287, 288, 290, 291, 292, 294, 295, 297, 332, 333, 334, 368, 409, 497, 501]);

function record(value: unknown): XmlRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as XmlRecord : {}; }
function scalar(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function list(value: unknown) { const raw = record(value).h; return (Array.isArray(raw) ? raw : raw == null ? [] : [raw]).map(scalar).filter(Boolean); }
function decodeEntities(value: string) {
  return value.replace(/&#(x?[0-9a-f]+);/giu, (_all, code: string) => String.fromCodePoint(Number.parseInt(code.replace(/^x/i, ""), /^x/i.test(code) ? 16 : 10)))
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&apos;|&#39;/gi, "'");
}
export function publicJobText(value: unknown, maxLength = 1400) {
  const clean = decodeEntities(scalar(value)).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/giu, "[kontakt odstraněn]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[kontakt odstraněn]")
    .replace(/[\t ]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return clean.slice(0, maxLength).trim();
}
function safeDetailUrl(value: unknown) {
  try { const url = new URL(scalar(value)); return url.protocol === "https:" && allowedDetailHosts.has(url.hostname.toLowerCase()) && !url.username && !url.password && (!url.port || url.port === "443") ? url.href : undefined; } catch { return undefined; }
}
function positiveNumber(value: unknown) { const raw = scalar(value).replace(",", "."); if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return undefined; const number = Number(raw); return Number.isFinite(number) && number > 0 ? number : undefined; }
function positiveInteger(value: unknown, maximum = 32767) { const raw = scalar(value); if (!/^\d+$/.test(raw)) return undefined; const number = Number(raw); return number > 0 && number <= maximum ? number : undefined; }
function fieldFor(value: unknown): Job["field"] { const id = Number(scalar(value)); if (itPositions.has(id)) return "IT"; if (electricalPositions.has(id)) return "Elektro"; if (adminPositions.has(id)) return "Administrativa"; if (gastroPositions.has(id)) return "Gastro"; return "Ostatní"; }

async function parseItem(item: XmlRecord, warnings: string[]): Promise<ParsedFajnJob | undefined> {
  const externalId = scalar(item.id_inzeratu); const applyUrl = safeDetailUrl(item.url_detail); const title = publicJobText(item.titulek_cs || item.titulek_sk, 180);
  if (!/^\d{1,20}$/.test(externalId) || !applyUrl || title.length < 3) return undefined;
  const descriptions = [item.popis_cs || item.popis_sk, item.pozadujeme_cs || item.pozadujeme_sk, item.nabizime_cs || item.nabizime_sk].map((value) => publicJobText(value, 900)).filter(Boolean);
  const description = publicJobText(descriptions.join("\n\n"), 1400) || "Podrobnosti jsou uvedené na původním inzerátu.";
  const currency = currencies[scalar(item.mzda_mena)]; const unit = salaryUnits[scalar(item.mzda_typ)]; let salaryMin = positiveNumber(item.mzda_od); let salaryMax = positiveNumber(item.mzda_do);
  if ((salaryMin || salaryMax) && (!currency || !unit)) { warnings.push(`Inzerát ${externalId}: neznámá měna nebo typ mzdy; odměna nebyla zveřejněna.`); salaryMin = undefined; salaryMax = undefined; }
  if (salaryMin && salaryMax && salaryMax < salaryMin) { warnings.push(`Inzerát ${externalId}: neplatný rozsah mzdy; odměna nebyla zveřejněna.`); salaryMin = undefined; salaryMax = undefined; }
  const workloadCodes = list(item.uvazek); const workload = workloadCodes.map((code) => code === "1" ? "Plný úvazek" : code === "2" ? "Zkrácený úvazek" : "").filter(Boolean).join(" / ") || "Úvazek neuveden";
  const positionExternalId = scalar(item.id_pozice) || undefined; const durationDays = positiveInteger(item.pocet_dni, 366); const positionsCount = positiveInteger(item.pocet_mist, 10000);
  const location = publicJobText(item.adresa_pracoviste_adresa, 140) || "Brno";
  const company = publicJobText(item.nazev_firmy || item.firma_nazev || item.firma, 120) || undefined;
  const canonical = { externalId, title, company, description, field: fieldFor(item.id_pozice), workType: scalar(item.id_sekce) === "1" ? "DPP / DPČ" : "Pracovní poměr", location, applyUrl, salaryMin, salaryMax, salaryCurrency: salaryMin || salaryMax ? currency : undefined, salaryUnit: salaryMin || salaryMax || ["29", "31"].includes(scalar(item.mzda_typ)) ? unit : undefined, workload, workloadCodes, benefitCodes: list(item.benefity), countryExternalId: scalar(item.id_statu) || undefined, cityExternalId: scalar(item.id_mesta) || undefined, positionExternalId, positionsCount, durationDays } satisfies Omit<ParsedFajnJob, "sourceHash">;
  return { ...canonical, sourceHash: await sha256(JSON.stringify(canonical)) };
}

export async function parseFajnXml(input: Uint8Array | string): Promise<FajnParseResult> {
  const xml = typeof input === "string" ? input : new TextDecoder("utf-8", { fatal: true }).decode(input);
  if (/<!DOCTYPE|<!ENTITY|\bSYSTEM\b|\bPUBLIC\b/i.test(xml)) throw new Error("XML obsahuje zakázanou deklaraci DTD nebo entity.");
  const validation = XMLValidator.validate(xml, { allowBooleanAttributes: false }); if (validation !== true) throw new Error("XML feed není platný.");
  const parsed = new XMLParser({ ignoreAttributes: false, ignoreDeclaration: true, trimValues: true, parseTagValue: false, processEntities: false, htmlEntities: false }).parse(xml) as XmlRecord;
  if (Object.keys(parsed).length !== 1 || !parsed.inzeraty) throw new Error("XML feed nemá očekávaný kořen inzeraty.");
  const additions = record(parsed.inzeraty).pridani; const items = (Array.isArray(additions) ? additions : additions ? [additions] : []).map(record);
  const warnings: string[] = []; const jobs: ParsedFajnJob[] = []; let rejected = 0;
  for (const item of items) { const job = await parseItem(item, warnings); if (job) jobs.push(job); else rejected += 1; }
  return { jobs: [...new Map(jobs.map((job) => [job.externalId, job])).values()], rejected: rejected + Math.max(0, jobs.length - new Set(jobs.map((job) => job.externalId)).size), warnings };
}
