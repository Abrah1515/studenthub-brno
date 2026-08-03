import type { ConnectorContext, ConnectorResult, NormalizedEvent } from "@/lib/sources/types";
import { inferCategory, parseCzechDatePoint, parseCzechDateRange, sha256 } from "@/lib/sources/normalize";

type Cell = { attributes: string; text: string; facultyCode?: string };

const isFacultyCodes: Record<string, string> = {
  "muni-lf": "1411", "muni-faf": "1416", "muni-ff": "1421", "muni-prav": "1422", "muni-fss": "1423",
  "muni-prf": "1431", "muni-fi": "1433", "muni-pedf": "1441", "muni-fsps": "1451", "muni-esf": "1456",
  "jamu-hf": "5451", "jamu-df": "5453",
};

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&ndash;|&mdash;/gi, "–")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)));
}

export function htmlText(value: string) {
  return decodeEntities(value.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function rows(table: string) {
  return [...table.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)].map((row) => ({
    attributes: row[1],
    cells: [...row[2].matchAll(/<(?:td|th)\b([^>]*)>([\s\S]*?)<\/(?:td|th)>/gi)].map((cell): Cell => {
      const facultyCode = cell[1].match(/class=["'][^"']*\bslop:(\d+)\b/i)?.[1];
      return { attributes: cell[1], text: htmlText(cell[2]), facultyCode };
    }),
  }));
}

function sourceStatus(context: ConnectorContext) {
  return context.source.monitoringMode === "automatic_publish" ? "approved" as const : "pending" as const;
}

async function event(context: ConnectorContext, values: { title: string; startAt: string; endAt?: string; allDay: boolean; academicYear: string; originalText: string }): Promise<NormalizedEvent> {
  const category = inferCategory(values.title);
  const signature = `${context.source.id}|${context.source.facultyId}|${category}|${values.title}|${values.startAt}|${values.endAt || ""}`;
  return {
    externalId: (await sha256(signature)).slice(0, 32), title: values.title,
    description: "Událost načtená ze strukturovaného veřejného harmonogramu.",
    startAt: values.startAt, endAt: values.endAt, allDay: values.allDay, timezone: "Europe/Prague", category,
    academicYear: values.academicYear, universityId: context.source.universityId, facultyId: context.source.facultyId,
    sourceId: context.source.id, sourceUrl: context.source.sourceUrl, sourceHash: await sha256(values.originalText),
    confidence: context.source.monitoringMode === "automatic_publish" ? 0.98 : 0.82, status: sourceStatus(context),
    lastVerifiedAt: context.checkedAt, sourceDocumentTitle: "Přehled harmonogramu období fakult", originalText: values.originalText,
  };
}

function academicYearFromPeriod(period: string) {
  const match = htmlText(period).toLocaleLowerCase("cs-CZ").match(/(jaro|léto|podzim|zima)\s*(20\d{2})/);
  if (!match) return null;
  const year = Number(match[2]);
  return /jaro|léto/.test(match[1]) ? `${year - 1}/${year}` : `${year}/${year + 1}`;
}

const allowedIsCategory = /registrac|zápis|zmen|změn|zveřejnění rozvrhu|výuka|zkouškové|szz|státnic/iu;

export async function parseIsAcademicPeriods(context: ConnectorContext): Promise<ConnectorResult> {
  const html = new TextDecoder().decode(context.body);
  const facultyCode = isFacultyCodes[context.source.facultyId];
  if (!facultyCode) return { events: [], warnings: ["Pro fakultu chybí bezpečné mapování sloupce veřejného IS."] };
  const tables = [...html.matchAll(/<table\b([^>]*)id=["']obdobi:([^"']+)["']([^>]*)>([\s\S]*?)<\/table>/gi)]
    .map((match) => ({ period: htmlText(match[2]), html: match[4], academicYear: academicYearFromPeriod(match[2]) }))
    .filter((item): item is { period: string; html: string; academicYear: string } => Boolean(item.academicYear));
  const parsedByYear = new Map<string, NormalizedEvent[]>();
  for (const table of tables) {
    let currentLabel = "";
    const openRanges = new Map<string, { label: string; start: ReturnType<typeof parseCzechDatePoint>; original: string }>();
    for (const row of rows(table.html)) {
      const target = row.cells.find((cell) => cell.facultyCode === facultyCode);
      if (!target || !target.text) continue;
      const descriptive = row.cells.filter((cell) => !cell.facultyCode).map((cell) => cell.text).filter((text) => text && !/^(od|do)$/i.test(text));
      if (descriptive.length) currentLabel = descriptive.join(" – ");
      if (!currentLabel || !allowedIsCategory.test(currentLabel)) continue;
      const direction = row.cells.some((cell) => /^od$/i.test(cell.text)) ? "from" : row.cells.some((cell) => /^do$/i.test(cell.text)) ? "to" : "single";
      const key = `${currentLabel}|${table.period}`;
      if (direction === "from") {
        openRanges.set(key, { label: currentLabel, start: parseCzechDatePoint(target.text), original: `${currentLabel}: ${target.text}` });
        continue;
      }
      if (direction === "to") {
        const open = openRanges.get(key); const end = parseCzechDatePoint(target.text, true);
        if (!open?.start || !end) continue;
        const title = `${open.label} · ${table.period}`;
        if (inferCategory(title) === "Ostatní") continue;
        const normalized = await event(context, { title, startAt: open.start.iso, endAt: end.iso, allDay: !open.start.hasTime && !end.hasTime, academicYear: table.academicYear, originalText: `${open.original} – ${target.text}` });
        parsedByYear.set(table.academicYear, [...(parsedByYear.get(table.academicYear) || []), normalized]);
        openRanges.delete(key); continue;
      }
      const point = parseCzechDatePoint(target.text); if (!point) continue;
      const title = `${currentLabel} · ${table.period}`; if (inferCategory(title) === "Ostatní") continue;
      const normalized = await event(context, { title, startAt: point.iso, allDay: !point.hasTime, academicYear: table.academicYear, originalText: `${currentLabel}: ${target.text}` });
      parsedByYear.set(table.academicYear, [...(parsedByYear.get(table.academicYear) || []), normalized]);
    }
  }
  const latestYear = [...parsedByYear.keys()].sort().at(-1);
  const events = latestYear ? parsedByYear.get(latestYear) || [] : [];
  return { events, warnings: events.length ? [] : ["Veřejný IS neobsahuje pro zvolenou fakultu jednoznačné aktuální termíny."], sourceText: htmlText(html), documentTitle: "Přehled harmonogramu období fakult", normalizedHash: await sha256(JSON.stringify(events.map((item) => [item.externalId, item.sourceHash]))) };
}

const pefHeaders: Array<{ pattern: RegExp; title: string }> = [
  { pattern: /rozvrhovaná výuka/i, title: "Rozvrhovaná výuka" },
  { pattern: /zkouškové období/i, title: "Zkouškové období" },
  { pattern: /registrace předmětů/i, title: "Registrace předmětů" },
];

export async function parseMendeluPef(context: ConnectorContext): Promise<ConnectorResult> {
  const html = new TextDecoder().decode(context.body); const events: NormalizedEvent[] = [];
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((match) => match[0]);
  for (const table of tables) {
    const tableRows = rows(table); if (!tableRows.length) continue;
    const headers = tableRows[0].cells.map((cell) => cell.text); const year = headers[0]?.match(/20\d{2}\/20\d{2}/)?.[0];
    const mapping = headers.map((header) => pefHeaders.find((item) => item.pattern.test(header)) || null);
    if (!year || mapping.filter(Boolean).length !== pefHeaders.length) continue;
    for (const row of tableRows.slice(1)) {
      const semester = row.cells[0]?.text; if (!semester) continue;
      for (let index = 1; index < row.cells.length; index += 1) {
        const mapped = mapping[index]; if (!mapped) continue;
        const range = parseCzechDateRange(row.cells[index].text); if (!range) continue;
        events.push(await event(context, { title: `${mapped.title} · ${semester}`, startAt: range.start, endAt: range.end, allDay: range.allDay, academicYear: year, originalText: `${mapped.title}: ${row.cells[index].text}` }));
      }
    }
  }
  return { events, warnings: events.length ? [] : ["Strukturovaná tabulka PEF nebyla nalezena nebo změnila záhlaví."], sourceText: htmlText(html), documentTitle: "Harmonogram PEF MENDELU", normalizedHash: await sha256(JSON.stringify(events.map((item) => [item.externalId, item.sourceHash]))) };
}
