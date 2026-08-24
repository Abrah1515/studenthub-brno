import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { Job, JobRewardUnit } from "@/lib/types";
import { sha256 } from "@/lib/sources/normalize";
import {
  brnoCityCodes, czechCountryCodes, fajnBenefits, fajnCurrencies, fajnEducation, fajnPositions,
  fajnSalaryUnits, fajnSuitability, fajnWorkloads, knownOutsideBrnoCityCodes, nonCzechCountryCodes,
} from "@/lib/job-feed/catalogs";

type XmlRecord = Record<string, unknown>;
export type FajnRejectCode = "invalid_id" | "invalid_url" | "missing_title" | "invalid_content" | "wrong_section" | "outside_brno" | "unverified_location" | "duplicate_external_id";
export type FajnRejection = { externalId?: string; code: FajnRejectCode; message: string };
export type ParsedFajnJob = {
  externalId: string; title: string; company?: string; description: string; field: Job["field"]; workType: Job["type"];
  location: string; applyUrl: string; salaryMin?: number; salaryMax?: number; salaryCurrency?: Job["rewardCurrency"];
  salaryUnit?: JobRewardUnit; workload?: string; workloadCodes: string[]; benefitCodes: string[]; suitabilityCodes: string[];
  minimumEducationExternalId?: string; positionLabel?: string; countryExternalId?: string; cityExternalId?: string;
  positionExternalId?: string; positionsCount?: number; durationDays?: number; sourceHash: string;
};
export type FajnParseResult = {
  jobs: ParsedFajnJob[]; candidates: ParsedFajnJob[]; total: number; rejected: number; rejections: FajnRejection[]; warnings: string[];
};

const allowedDetailHosts = new Set(["fajn-brigady.cz", "www.fajn-brigady.cz", "fajn-brigady.sk", "www.fajn-brigady.sk", "inwork.cz", "www.inwork.cz"]);

function record(value: unknown): XmlRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as XmlRecord : {}; }
function scalar(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function list(value: unknown) {
  const node = record(value); const raw = node.h ?? value;
  return (Array.isArray(raw) ? raw : raw == null || typeof raw === "object" ? [] : [raw]).map(scalar).filter(Boolean);
}
function decodeEntities(value: string) {
  return value.replace(/&#(x?[0-9a-f]+);/giu, (_all, code: string) => {
    const point = Number.parseInt(code.replace(/^x/i, ""), /^x/i.test(code) ? 16 : 10);
    return point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : "";
  })
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
  try {
    const url = new URL(scalar(value));
    if (url.protocol !== "https:" || !allowedDetailHosts.has(url.hostname.toLowerCase()) || url.username || url.password || (url.port && url.port !== "443")) return undefined;
    url.hash = ""; return url.href;
  } catch { return undefined; }
}
function positiveNumber(value: unknown) { const raw = scalar(value).replace(",", "."); if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return undefined; const number = Number(raw); return Number.isFinite(number) && number > 0 ? number : undefined; }
function positiveInteger(value: unknown, maximum = 32767) { const raw = scalar(value); if (!/^\d+$/.test(raw)) return undefined; const number = Number(raw); return number > 0 && number <= maximum ? number : undefined; }
function knownCodes(codes: string[], catalog: Readonly<Record<string, string>>, label: string, externalId: string, warnings: string[]) {
  const unknown = codes.filter((code) => !catalog[code]);
  if (unknown.length) warnings.push(`Inzerát ${externalId}: neznámý číselník ${label} (${unknown.join(", ")}); hodnoty byly vynechány.`);
  return codes.filter((code) => Boolean(catalog[code]));
}
function rejection(item: XmlRecord, code: FajnRejectCode, message: string): FajnRejection {
  const id = scalar(item.id_inzeratu); return { externalId: id || undefined, code, message };
}
function locationFor(item: XmlRecord): { location?: string; rejection?: FajnRejection; warning?: string; cityExternalId?: string } {
  const externalId = scalar(item.id_inzeratu); const country = scalar(item.id_statu);
  const city = scalar(item.adresa_pracoviste_id_mesta || item.id_mesta); const address = publicJobText(item.adresa_pracoviste_adresa, 140);
  if (nonCzechCountryCodes.has(country)) return { rejection: rejection(item, "outside_brno", "Nabídka je podle číselníku mimo Česko.") };
  if (knownOutsideBrnoCityCodes[city]) return { rejection: rejection(item, "outside_brno", `Lokalita ${knownOutsideBrnoCityCodes[city]} neleží v Brně ani v okrese Brno.`) };
  if (brnoCityCodes[city]) return { location: address || brnoCityCodes[city], cityExternalId: city };
  if (/\bbrno(?:[-\s]|$)/iu.test(address)) return { location: address, cityExternalId: city || undefined, warning: city ? `Inzerát ${externalId}: neznámý kód města ${city}; Brno bylo ověřeno z adresy.` : undefined };
  if (!city && czechCountryCodes.has(country)) return { location: "Brno", warning: `Inzerát ${externalId}: přesná lokalita v brněnském feedu chybí; zveřejněno jako Brno.` };
  return { rejection: rejection(item, "unverified_location", "Lokalitu nelze bezpečně přiřadit k Brnu ani jeho okolí.") };
}

async function parseCandidate(item: XmlRecord, warnings: string[]): Promise<{ job?: ParsedFajnJob; rejection?: FajnRejection }> {
  const externalId = scalar(item.id_inzeratu);
  if (!/^\d{1,20}$/.test(externalId)) return { rejection: rejection(item, "invalid_id", "Chybí platné číselné ID inzerátu.") };
  const applyUrl = safeDetailUrl(item.url_detail);
  if (!applyUrl) return { rejection: rejection(item, "invalid_url", "Detail inzerátu není na povolené HTTPS doméně.") };
  const title = publicJobText(item.titulek_cs || item.titulek_sk, 180);
  if (title.length < 3) return { rejection: rejection(item, "missing_title", "Chybí použitelný český i slovenský název.") };
  if (scalar(item.id_sekce) !== "1") return { rejection: rejection(item, "wrong_section", "Položka nepatří do sekce brigád (id_sekce=1).") };
  const locationResult = locationFor(item);
  if (locationResult.rejection) return { rejection: locationResult.rejection };
  if (locationResult.warning) warnings.push(locationResult.warning);
  const descriptions = [item.popis_cs || item.popis_sk, item.pozadujeme_cs || item.pozadujeme_sk, item.nabizime_cs || item.nabizime_sk]
    .map((value) => publicJobText(value, 900)).filter(Boolean);
  const description = publicJobText(descriptions.join("\n\n"), 1400);
  const currencyCode = scalar(item.mzda_mena); const unitCode = scalar(item.mzda_typ);
  const currency = fajnCurrencies[currencyCode]; const unit = fajnSalaryUnits[unitCode];
  const rawMin = scalar(item.mzda_od); const rawMax = scalar(item.mzda_do);
  let salaryMin = positiveNumber(item.mzda_od); let salaryMax = positiveNumber(item.mzda_do);
  if ((rawMin && !salaryMin) || (rawMax && !salaryMax) || (!rawMin && rawMax) || ((salaryMin || salaryMax) && (!currency || !unit))) {
    warnings.push(`Inzerát ${externalId}: neúplná nebo neznámá mzda; odměna nebyla zveřejněna.`); salaryMin = undefined; salaryMax = undefined;
  }
  if (salaryMin && salaryMax && salaryMax < salaryMin) {
    warnings.push(`Inzerát ${externalId}: obrácený rozsah mzdy; odměna nebyla zveřejněna.`); salaryMin = undefined; salaryMax = undefined;
  }
  if (unitCode && !unit) warnings.push(`Inzerát ${externalId}: neznámý typ mzdy ${unitCode}.`);
  if (currencyCode && !currency && (rawMin || rawMax)) warnings.push(`Inzerát ${externalId}: neznámá měna ${currencyCode}.`);
  const workloadCodes = knownCodes(list(item.uvazek), fajnWorkloads, "úvazku", externalId, warnings);
  const benefitCodes = knownCodes(list(item.benefity), fajnBenefits, "benefitů", externalId, warnings);
  const suitabilityCodes = knownCodes(list(item.vhodne_pro || item.vhod), fajnSuitability, "vhodnosti", externalId, warnings);
  const educationCode = scalar(item.id_min_vzdelani);
  if (educationCode && !fajnEducation[educationCode]) warnings.push(`Inzerát ${externalId}: neznámé minimální vzdělání ${educationCode}; hodnota byla vynechána.`);
  const positionExternalId = scalar(item.id_pozice) || undefined; const position = positionExternalId ? fajnPositions[positionExternalId] : undefined;
  if (positionExternalId && !position) warnings.push(`Inzerát ${externalId}: neznámá pozice ${positionExternalId}; použita kategorie Ostatní.`);
  const durationDays = positiveInteger(item.pocet_dni, 366); const positionsCount = positiveInteger(item.pocet_mist, 10000);
  const company = publicJobText(item.nazev_firmy || item.firma_nazev || item.firma, 120) || undefined;
  const canonical = {
    externalId, title, company, description, field: position?.field || "Ostatní" as Job["field"], workType: "Brigáda" as Job["type"],
    location: locationResult.location!, applyUrl, salaryMin, salaryMax, salaryCurrency: salaryMin ? currency : undefined,
    salaryUnit: salaryMin || ["29", "31"].includes(unitCode) ? unit : undefined,
    workload: workloadCodes.map((code) => fajnWorkloads[code]).join(" / ") || undefined,
    workloadCodes, benefitCodes, suitabilityCodes,
    minimumEducationExternalId: educationCode && fajnEducation[educationCode] ? educationCode : undefined,
    positionLabel: position?.label, countryExternalId: scalar(item.id_statu) || undefined,
    cityExternalId: locationResult.cityExternalId, positionExternalId, positionsCount, durationDays,
  } satisfies Omit<ParsedFajnJob, "sourceHash">;
  return { job: { ...canonical, sourceHash: await sha256(JSON.stringify(canonical)) } };
}

export async function parseFajnXml(input: Uint8Array | string): Promise<FajnParseResult> {
  const xml = typeof input === "string" ? input : new TextDecoder("utf-8", { fatal: true }).decode(input);
  if (/<!DOCTYPE|<!ENTITY|\bSYSTEM\b|\bPUBLIC\b/i.test(xml)) throw new Error("XML obsahuje zakázanou deklaraci DTD nebo entity.");
  const validation = XMLValidator.validate(xml, { allowBooleanAttributes: false });
  if (validation !== true) throw new Error("XML feed není platný.");
  const parsed = new XMLParser({ ignoreAttributes: false, ignoreDeclaration: true, trimValues: true, parseTagValue: false, processEntities: false, htmlEntities: false }).parse(xml) as XmlRecord;
  if (Object.keys(parsed).length !== 1 || !parsed.inzeraty) throw new Error("XML feed nemá očekávaný kořen inzeraty.");
  const additions = record(parsed.inzeraty).pridani;
  const items = (Array.isArray(additions) ? additions : additions ? [additions] : []).map(record);
  const warnings: string[] = []; const candidates: ParsedFajnJob[] = []; const rejections: FajnRejection[] = [];
  const acceptedIds = new Set<string>(); const jobs: ParsedFajnJob[] = [];
  for (const item of items) {
    let parsedItem: Awaited<ReturnType<typeof parseCandidate>>;
    try { parsedItem = await parseCandidate(item, warnings); }
    catch { parsedItem = { rejection: rejection(item, "invalid_content", "Položku nebylo možné bezpečně normalizovat.") }; }
    if (!parsedItem.job) { rejections.push(parsedItem.rejection!); continue; }
    candidates.push(parsedItem.job);
    if (acceptedIds.has(parsedItem.job.externalId)) { rejections.push(rejection(item, "duplicate_external_id", "Duplicitní ID v jednom feedu.")); continue; }
    acceptedIds.add(parsedItem.job.externalId); jobs.push(parsedItem.job);
  }
  return { jobs, candidates, total: items.length, rejected: rejections.length, rejections, warnings };
}
