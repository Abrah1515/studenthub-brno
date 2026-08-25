import { haversineDistanceKm } from "@/lib/places";

export const placeCategoryCodes = ["restaurant","cafe","pub_bar","fast_food","canteen","library","study_room","coworking","public_toilet","sport","student_service","other"] as const;
export type PlaceCategoryCode = (typeof placeCategoryCodes)[number];
export const placeCategoryLabels: Record<PlaceCategoryCode,string> = {
  restaurant: "Restaurace", cafe: "Kavárna", pub_bar: "Hospoda a bar", fast_food: "Bistro a rychlé občerstvení",
  canteen: "Menza", library: "Knihovna", study_room: "Studovna", coworking: "Coworking",
  public_toilet: "Veřejné toalety", sport: "Sport a pohyb", student_service: "Studentské služby", other: "Ostatní",
};
export const databasePlaceCategoryLabels: Record<string,(typeof placeCategoryLabels)[PlaceCategoryCode]> = {
  ...placeCategoryLabels, print: "Studentské služby", service: "Studentské služby",
};
export const placeCategoryColors: Record<PlaceCategoryCode,string> = {
  restaurant: "#dc6b2f", cafe: "#9a6735", pub_bar: "#7b4bb7", fast_food: "#e0a11b", canteen: "#d65c43", library: "#315ba6",
  study_room: "#287466", coworking: "#397b9b", public_toilet: "#64748b", sport: "#169260", student_service: "#b45309", other: "#6b7280",
};

export const placeTraitCodes = ["quiet_study","group_work","good_wifi","many_outlets","low_price","accessible","evening_open","good_food"] as const;
export type PlaceTraitCode = (typeof placeTraitCodes)[number];
export const placeTraitLabels: Record<PlaceTraitCode,string> = {
  quiet_study: "Vhodné pro tiché studium", group_work: "Vhodné pro skupinovou práci", good_wifi: "Dobrá Wi‑Fi", many_outlets: "Dost zásuvek",
  low_price: "Nízká cena", accessible: "Bezbariérový přístup", evening_open: "Otevřeno večer", good_food: "Dobré jídlo",
};

export function normalizePlaceText(value: string) {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("cs-CZ").replace(/\b(?:a|s|r|o)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

function sourceHost(value?: string | null) {
  try { return value ? new URL(value).hostname.replace(/^www\./, "") : ""; } catch { return ""; }
}

export type PlaceDuplicateInput = { id: string; name: string; address: string; lat: number; lng: number; website?: string; aliases?: string[] };
export type PlaceDuplicateMatch = { id: string; score: number; reasons: string[]; distanceMeters: number };

export function findPlaceDuplicates(candidate: Omit<PlaceDuplicateInput,"id">, existing: PlaceDuplicateInput[]) {
  const candidateName = normalizePlaceText(candidate.name); const candidateAddress = normalizePlaceText(candidate.address); const candidateHost = sourceHost(candidate.website);
  return existing.map((place): PlaceDuplicateMatch | null => {
    const distanceMeters = Math.round(haversineDistanceKm({ lat: candidate.lat, lng: candidate.lng }, { lat: place.lat, lng: place.lng }) * 1000);
    const names = [place.name,...(place.aliases || [])].map(normalizePlaceText); const nameMatch = names.includes(candidateName); const addressMatch = normalizePlaceText(place.address) === candidateAddress;
    const webMatch = Boolean(candidateHost && candidateHost === sourceHost(place.website)); const near = distanceMeters <= 120; const close = distanceMeters <= 300;
    const reasons = [nameMatch && "stejný nebo alternativní název", addressMatch && "stejná adresa", webMatch && "stejný web", near && "souřadnice do 120 m"].filter(Boolean) as string[];
    const score = Number(nameMatch) * 45 + Number(addressMatch) * 35 + Number(webMatch) * 35 + Number(near) * 30 + Number(close && nameMatch) * 20;
    return score >= 55 ? { id: place.id, score, reasons, distanceMeters } : null;
  }).filter((item): item is PlaceDuplicateMatch => Boolean(item)).sort((a,b) => b.score-a.score || a.distanceMeters-b.distanceMeters).slice(0,5);
}

const dayCodes: Record<string,number> = { ne:0, po:1, út:2, ut:2, st:3, čt:4, ct:4, pá:5, pa:5, so:6 };
function minutes(value: string) { const match=value.match(/(\d{1,2})[:.]?(\d{2})?/); return match ? Number(match[1])*60+Number(match[2]||0) : null; }
export function isPlaceOpenNow(hours: string | undefined, at = new Date()) {
  if (!hours) return false; const folded=normalizePlaceText(hours); if (/\b24\s*7\b/.test(folded) || folded.includes("nonstop")) return true;
  const local = new Intl.DateTimeFormat("cs-CZ",{timeZone:"Europe/Prague",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(at);
  const day = dayCodes[normalizePlaceText(local.find((part)=>part.type==="weekday")?.value || "")]; const now=Number(local.find((part)=>part.type==="hour")?.value)*60+Number(local.find((part)=>part.type==="minute")?.value);
  if (!Number.isFinite(day) || !Number.isFinite(now)) return false;
  for (const segment of hours.split(/[;\n]/)) {
    const clean=normalizePlaceText(segment); const range=segment.match(/(\d{1,2}(?::|\.)?\d{0,2})\s*[–—-]\s*(\d{1,2}(?::|\.)?\d{0,2})/); if (!range) continue;
    const start=minutes(range[1]); const end=minutes(range[2]); if (start==null || end==null) continue;
    const dayExpression=segment.normalize("NFKD").replace(/\p{Diacritic}/gu,"").toLocaleLowerCase("cs-CZ"); const days = clean.includes("denne") ? [0,1,2,3,4,5,6] : Object.entries(dayCodes).filter(([code])=>new RegExp(`\\b${code}\\b`).test(clean)).map(([,value])=>value);
    let applies=days.includes(day); const dayRange=dayExpression.match(/\b(po|ut|st|ct|pa|so|ne)\s*[–—-]\s*(po|ut|st|ct|pa|so|ne)\b/);
    if (dayRange) { const first=dayCodes[dayRange[1]]; const last=dayCodes[dayRange[2]]; applies=first<=last ? day>=first&&day<=last : day>=first||day<=last; }
    if (applies && (end>=start ? now>=start&&now<end : now>=start||now<end)) return true;
  }
  return false;
}

export function aggregatePlaceTraits(rows: Array<{ trait: string; authorId: string }>, minimumIndependentVotes = 3) {
  const grouped = new Map<string,Set<string>>(); for (const row of rows) { if (!placeTraitCodes.includes(row.trait as PlaceTraitCode)) continue; const authors=grouped.get(row.trait)||new Set<string>(); authors.add(row.authorId); grouped.set(row.trait,authors); }
  return [...grouped.entries()].filter(([,authors])=>authors.size>=minimumIndependentVotes).map(([trait,authors])=>({ trait:trait as PlaceTraitCode,label:placeTraitLabels[trait as PlaceTraitCode],count:authors.size })).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,"cs-CZ"));
}
