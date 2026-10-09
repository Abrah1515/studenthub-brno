import type { ContentSource, SourceCoverageStatus, SourceFormat, SourceMonitoringMode } from "./types.ts";
import { fajnFeedConfig } from "../job-feed/config.ts";

const muniSource = "https://is.muni.cz/predmety/obdobi";

type RegisteredSource = Omit<ContentSource, "academicYear" | "confidence" | "requiresReview" | "notes" | "sourceDocumentTitle">;

type AcademicSourceInput = {
  cityId: string;
  universityId: string;
  facultyId: string;
  url: string;
  format?: SourceFormat;
  parserKey?: string;
  monitoringMode?: SourceMonitoringMode;
  coverageStatus?: SourceCoverageStatus;
  coverageEvidence?: string;
  refreshIntervalHours?: number;
};

function academicSource(input: AcademicSourceInput): RegisteredSource {
  const host = new URL(input.url).hostname.toLowerCase();
  const coverageStatus = input.coverageStatus || "needs_review";
  const monitoringMode = input.monitoringMode || (coverageStatus === "unavailable" ? "not_found_monitored" : "automatic_review");
  return {
    id: `src-${input.facultyId}`,
    cityId: input.cityId,
    universityId: input.universityId,
    facultyId: input.facultyId,
    sourceType: "academic_calendar",
    sourceUrl: input.url,
    officialDomain: host,
    format: input.format || (input.url.toLowerCase().includes(".pdf") ? "pdf" : "html"),
    parserKey: input.parserKey || (input.url.toLowerCase().includes(".pdf") ? "pdfjs-academic-calendar" : "generic-academic-html"),
    enabled: true,
    refreshIntervalHours: input.refreshIntervalHours || (input.url.toLowerCase().includes(".pdf") ? 168 : 48),
    monitoringMode,
    termsNote: input.coverageEvidence || "Oficiální veřejný zdroj akademického harmonogramu; změny čekají na bezpečnou kontrolu.",
    coverageStatus,
    coverageEvidence: input.coverageEvidence,
    priority: coverageStatus === "complete" ? 100 : coverageStatus === "covered_by_central" ? 80 : 50,
    deepDiscoveryIntervalHours: 168,
    discoveryPageLimit: 4,
    discoveryDepth: 2,
  };
}

const pragueAcademicSources: RegisteredSource[] = [
  academicSource({ cityId: "praha", universityId: "cuni", facultyId: "cuni-ktf", url: "https://www.ktf.cuni.cz/KTF-2332.html", coverageStatus: "complete", coverageEvidence: "Aktuální fakultní harmonogram KTF UK 2026/2027." }),
  academicSource({ cityId: "praha", universityId: "cuni", facultyId: "cuni-etf", url: "https://web.etf.cuni.cz/ETFN-830.html", coverageStatus: "complete", coverageEvidence: "Aktuální fakultní harmonogram ETF UK." }),
  academicSource({ cityId: "praha", universityId: "cuni", facultyId: "cuni-htf", url: "https://htf.cuni.cz/HTF-125.html", coverageStatus: "complete", coverageEvidence: "Aktuální fakultní harmonogram HTF UK." }),
  academicSource({ cityId: "praha", universityId: "cuni", facultyId: "cuni-prf", url: "https://web.prf.cuni.cz/magisterske-studium/harmonogram-akademickeho-roku", coverageStatus: "complete", coverageEvidence: "Aktuální fakultní harmonogram PrF UK 2026/2027." }),
  academicSource({ cityId: "praha", universityId: "cuni", facultyId: "cuni-lf1", url: "https://www.lf1.cuni.cz/harmonogram-ak-roku", coverageStatus: "complete", coverageEvidence: "Aktuální harmonogram 1. LF UK 2026/2027." }),
  academicSource({ cityId: "praha", universityId: "cuni", facultyId: "cuni-lf2", url: "https://www.lf2.cuni.cz/opatreni-dekana-c-52026", coverageStatus: "complete", coverageEvidence: "Opatření děkana 2. LF UK pro rok 2026/2027." }),
  academicSource({ cityId: "praha", universityId: "cuni", facultyId: "cuni-lf3", url: "https://www.lf3.cuni.cz/3LF-2787.html", coverageStatus: "complete", coverageEvidence: "Aktuální harmonogram 3. LF UK 2026/2027." }),
  academicSource({ cityId: "praha", universityId: "cuni", facultyId: "cuni-ff", url: "https://www.ff.cuni.cz/fakulta/predpisy-a-dokumenty/opatreni-dekana/harmonogram/", coverageStatus: "complete", coverageEvidence: "Fakultní opatření a harmonogram FF UK." }),
  academicSource({ cityId: "praha", universityId: "cuni", facultyId: "cuni-prirod", url: "https://natur.cuni.cz/fakulta/organizacni-struktura/organy-fakulty/dekan-a-kolegium/opatreni-dekana/opatreni-dekana-c-12-2026", coverageStatus: "complete", coverageEvidence: "Opatření děkana PřF UK č. 12/2026." }),
  academicSource({ cityId: "praha", universityId: "cuni", facultyId: "cuni-mff", url: "https://www.mff.cuni.cz/cs/studenti/harmonogram-ak-roku/predbezny-harmonogram-akademickeho-roku-2026-2027.pdf", coverageStatus: "complete", coverageEvidence: "Oficiální PDF harmonogram MFF UK 2026/2027." }),
  academicSource({ cityId: "praha", universityId: "cuni", facultyId: "cuni-pedf", url: "https://pedf.cuni.cz/PEDF-71.html", coverageStatus: "covered_by_central", coverageEvidence: "Fakulta odkazuje na veřejný harmonogram UK a fakultní termíny." }),
  academicSource({ cityId: "praha", universityId: "cuni", facultyId: "cuni-fsv", url: "https://fsv.cuni.cz/studium/prava-povinnosti-studenta/harmonogram-akademickeho-roku", coverageStatus: "complete", coverageEvidence: "Aktuální fakultní harmonogram FSV UK." }),
  academicSource({ cityId: "praha", universityId: "cuni", facultyId: "cuni-fhs", url: "https://fhs.cuni.cz/FHS-3919.html", coverageStatus: "complete", coverageEvidence: "Aktuální fakultní harmonogram FHS UK." }),
  academicSource({ cityId: "praha", universityId: "cuni", facultyId: "cuni-ftvs", url: "https://www.ftvs.cuni.cz/cs/studenti/informace-pro-studenty/harmonogram-akademickeho-roku", coverageStatus: "complete", coverageEvidence: "Aktuální fakultní harmonogram FTVS UK 2026/2027." }),

  academicSource({ cityId: "praha", universityId: "cvut", facultyId: "cvut-fsv", url: "https://portal.fsv.cvut.cz/hlavni/akrok.php", coverageStatus: "complete", coverageEvidence: "Veřejný časový plán FSv ČVUT." }),
  academicSource({ cityId: "praha", universityId: "cvut", facultyId: "cvut-fs", url: "https://fs.cvut.cz/studium/bakalarske-a-magisterske/casovy-plan-ak-roku/", coverageStatus: "complete", coverageEvidence: "Aktuální časový plán FS ČVUT 2026/2027." }),
  academicSource({ cityId: "praha", universityId: "cvut", facultyId: "cvut-fel", url: "https://intranet.fel.cvut.cz/cz/education/harmonogram2627", coverageStatus: "complete", coverageEvidence: "Veřejně dostupný harmonogram FEL ČVUT 2026/2027." }),
  academicSource({ cityId: "praha", universityId: "cvut", facultyId: "cvut-fjfi", url: "https://fjfi.cvut.cz/cz/studium/harmonogram-roku-rozvrh/casovy-plan-akademickeho-roku", coverageStatus: "complete", coverageEvidence: "Aktuální časový plán FJFI ČVUT 2026/2027." }),
  academicSource({ cityId: "praha", universityId: "cvut", facultyId: "cvut-fa", url: "https://www.fa.cvut.cz/cs/studium/obecne/harmonogram", coverageStatus: "complete", coverageEvidence: "Aktuální harmonogram FA ČVUT." }),
  academicSource({ cityId: "praha", universityId: "cvut", facultyId: "cvut-fd", url: "https://www.fd.cvut.cz/studium/harmonogram-akademickeho-roku", coverageStatus: "complete", coverageEvidence: "Aktuální harmonogram FD ČVUT 2026/2027." }),
  academicSource({ cityId: "praha", universityId: "cvut", facultyId: "cvut-fbmi", url: "https://www.fbmi.cvut.cz/cs/student/casovy-plan", coverageStatus: "complete", coverageEvidence: "Aktuální časový plán FBMI ČVUT." }),
  academicSource({ cityId: "praha", universityId: "cvut", facultyId: "cvut-fit", url: "https://fit.cvut.cz/cs/studium/informacni-servis/harmonogram", coverageStatus: "complete", coverageEvidence: "Aktuální harmonogram FIT ČVUT." }),

  ...["vse-ffu", "vse-fmv", "vse-fph", "vse-fis", "vse-nf"].map((facultyId) => academicSource({ cityId: "praha", universityId: "vse", facultyId, url: "https://www.vse.cz/studenti/studium/harmonogramy/", coverageStatus: "covered_by_central", coverageEvidence: "Centrální harmonogram VŠE 2026/2027 pro všechny pražské fakulty." })),
  ...["czu-fappz", "czu-tf", "czu-fld", "czu-fzp"].map((facultyId) => academicSource({ cityId: "praha", universityId: "czu", facultyId, url: "https://www.czu.cz/dl/154159?lang=cs", format: "pdf", coverageStatus: "covered_by_central", coverageEvidence: "Centrální oficiální harmonogram ČZU 2026/2027." })),
  academicSource({ cityId: "praha", universityId: "czu", facultyId: "czu-pef", url: "https://www.pef.czu.cz/cs/r-7008-studium/r-10112-studijni-aktuality/harmonogram-zimniho-semestru.html", coverageStatus: "complete", coverageEvidence: "Fakultní harmonogram PEF ČZU." }),
  academicSource({ cityId: "praha", universityId: "czu", facultyId: "czu-ftz", url: "https://www.ftz.czu.cz/cs/r-8683-aktuality-home/harmonogram-akademickeho-roku-2026-2027.html", coverageStatus: "complete", coverageEvidence: "Fakultní harmonogram FTZ ČZU 2026/2027." }),
  ...["vscht-fcht", "vscht-ftop", "vscht-fpbt", "vscht-fchi"].map((facultyId) => academicSource({ cityId: "praha", universityId: "vscht", facultyId, url: "https://studium.vscht.cz/organizace-roku-vyuky?jazyk=cs&lang=cs", coverageStatus: "covered_by_central", coverageEvidence: "Centrální organizace akademického roku VŠCHT pro všechny fakulty." })),
];

// Tyto stabilní identifikátory už vlastní produkční termíny. Zůstávají v
// registru jako další oficiální důkaz, aby je dispatcher mohl dál ověřovat;
// nové fakultní zdroje je nenahrazují ani nemažou.
const pragueEstablishedSources: RegisteredSource[] = [
  { id: "src-praha-cuni", cityId: "praha", universityId: "cuni", facultyId: "cuni-ktf", sourceType: "academic_calendar", sourceUrl: "https://cuni.cz/UK-3952.html", officialDomain: "cuni.cz", format: "html", parserKey: "generic-academic-html", enabled: true, refreshIntervalHours: 48, monitoringMode: "automatic_review", coverageStatus: "partial", coverageEvidence: "Centrální harmonogram UK je doplňkový k fakultním zdrojům.", priority: 60, deepDiscoveryIntervalHours: 168, termsNote: "Centrální harmonogram UK 2026/2027; změny kontroluje editor." },
  { id: "src-praha-cvut", cityId: "praha", universityId: "cvut", facultyId: "cvut-fs", sourceType: "academic_calendar", sourceUrl: "https://www.cvut.cz/sites/default/files/content/d1dc93cd-5894-4521-b799-c7e715d3c59e/cs/20251009-harmonogram-akademickeho-roku-20262027.pdf", officialDomain: "cvut.cz", format: "pdf", parserKey: "pdfjs-academic-calendar", enabled: true, refreshIntervalHours: 168, monitoringMode: "automatic_review", coverageStatus: "covered_by_central", coverageEvidence: "Oficiální centrální harmonogram ČVUT 2026/2027.", priority: 80, deepDiscoveryIntervalHours: 168, termsNote: "Centrální harmonogram ČVUT; PDF změny kontroluje editor." },
  { id: "src-praha-cvut-fjfi", cityId: "praha", universityId: "cvut", facultyId: "cvut-fjfi", sourceType: "academic_calendar", sourceUrl: "https://edu.fjfi.cvut.cz/edu/Harmonogramy/Harmonogram_2026_2027.pdf", officialDomain: "fjfi.cvut.cz", format: "pdf", parserKey: "pdfjs-academic-calendar", enabled: true, refreshIntervalHours: 168, monitoringMode: "automatic_review", coverageStatus: "complete", coverageEvidence: "Oficiální časový plán FJFI ČVUT 2026/2027.", priority: 100, deepDiscoveryIntervalHours: 168, termsNote: "Fakultní PDF FJFI; změny kontroluje editor." },
  { id: "src-praha-vse", cityId: "praha", universityId: "vse", facultyId: "vse-ffu", sourceType: "academic_calendar", sourceUrl: "https://www.vse.cz/studenti/studium/harmonogramy/", officialDomain: "vse.cz", format: "html", parserKey: "generic-academic-html", enabled: true, refreshIntervalHours: 48, monitoringMode: "automatic_review", coverageStatus: "covered_by_central", coverageEvidence: "Centrální harmonogram VŠE 2026/2027.", priority: 80, deepDiscoveryIntervalHours: 168, termsNote: "Centrální harmonogram VŠE; změny kontroluje editor." },
  { id: "src-praha-czu", cityId: "praha", universityId: "czu", facultyId: "czu-fappz", sourceType: "academic_calendar", sourceUrl: "https://www.czu.cz/dl/154159?lang=cs", officialDomain: "czu.cz", format: "pdf", parserKey: "pdfjs-academic-calendar", enabled: true, refreshIntervalHours: 168, monitoringMode: "automatic_review", coverageStatus: "covered_by_central", coverageEvidence: "Centrální rozhodnutí rektora ČZU pro rok 2026/2027.", priority: 80, deepDiscoveryIntervalHours: 168, termsNote: "Centrální harmonogram ČZU; PDF změny kontroluje editor." },
  { id: "src-praha-vscht", cityId: "praha", universityId: "vscht", facultyId: "vscht-fcht", sourceType: "academic_calendar", sourceUrl: "https://studium.vscht.cz/organizace-roku-vyuky?jazyk=cs&lang=cs", officialDomain: "studium.vscht.cz", format: "html", parserKey: "generic-academic-html", enabled: true, refreshIntervalHours: 48, monitoringMode: "automatic_review", coverageStatus: "covered_by_central", coverageEvidence: "Centrální organizace akademického roku VŠCHT.", priority: 80, deepDiscoveryIntervalHours: 168, termsNote: "Centrální harmonogram VŠCHT; změny kontroluje editor." },
];
const brnoEstablishedSources: RegisteredSource[] = [
  { id: "src-brno-mendelu-central", cityId: "brno", universityId: "mendelu", facultyId: "mendelu-af", sourceType: "academic_calendar", sourceUrl: "https://mendelu.cz/o-univerzite/uredni-deska/zakladni-dokumenty-souvisejici-se-studiem/", officialDomain: "mendelu.cz", allowedDomains: ["mendelu.cz", "is.mendelu.cz"], format: "html", parserKey: "linked-document-review", enabled: true, refreshIntervalHours: 168, monitoringMode: "automatic_review", coverageStatus: "covered_by_central", coverageEvidence: "Nařízení rektora MENDELU č. 8/2026 potvrzuje společný akademický rok 2026/2027; fakultní harmonogramy poskytují detail.", priority: 80, deepDiscoveryIntervalHours: 168, discoveryPageLimit: 2, discoveryDepth: 2, termsNote: "Oficiální centrální rozcestník MENDELU; PDF na dokumentovém serveru se kontroluje jen v souladu s robots.txt." },
];

const ostravaAcademicSources: RegisteredSource[] = [
  ...["vsbtuo-fmt", "vsbtuo-fs", "vsbtuo-ekf"].map((facultyId) => academicSource({ cityId: "ostrava", universityId: "vsbtuo", facultyId, url: "https://www.vsb.cz/cs/student/harmonogram/?academicYear=2026", coverageStatus: "covered_by_central", coverageEvidence: "Centrální harmonogram VŠB-TUO 2026/2027 pro všechny fakulty." })),
  academicSource({ cityId: "ostrava", universityId: "vsbtuo", facultyId: "vsbtuo-fei", url: "https://www.fei.vsb.cz/cs-old/studium/harmonogramy-a-rozvrhy/", monitoringMode: "automatic_publish", coverageStatus: "complete", coverageEvidence: "Fakultní harmonogram FEI VŠB-TUO 2026/2027 se strukturovanou tabulkou." }),
  academicSource({ cityId: "ostrava", universityId: "vsbtuo", facultyId: "vsbtuo-fast", url: "https://www.fast.vsb.cz/cs/student/harmonogram?academicYear=2026", coverageStatus: "complete", coverageEvidence: "Fakultní harmonogram FAST VŠB-TUO 2026/2027." }),
  academicSource({ cityId: "ostrava", universityId: "vsbtuo", facultyId: "vsbtuo-fbi", url: "https://www.fbi.vsb.cz/cs/Student/harmonogram-akademickeho-roku/", coverageStatus: "complete", coverageEvidence: "Fakultní harmonogram FBI VŠB-TUO." }),
  academicSource({ cityId: "ostrava", universityId: "osu", facultyId: "osu-ff", url: "https://dokumenty.osu.cz/ff/uredni-deska/ff-harmonogram-ar-2026-2027.pdf", format: "pdf", coverageStatus: "complete", coverageEvidence: "Oficiální fakultní PDF harmonogram FF OU 2026/2027." }),
  academicSource({ cityId: "ostrava", universityId: "osu", facultyId: "osu-pdf", url: "https://dokumenty.osu.cz/pdf/urednideska/pdf-harmonogram-ar-2026-2027.pdf", format: "pdf", coverageStatus: "complete", coverageEvidence: "Oficiální fakultní PDF harmonogram PdF OU 2026/2027." }),
  academicSource({ cityId: "ostrava", universityId: "osu", facultyId: "osu-fu", url: "https://dokumenty.osu.cz/fu/urednideska/fu-harmonogram-ar-2026-2027.pdf", format: "pdf", coverageStatus: "complete", coverageEvidence: "Oficiální fakultní PDF harmonogram FU OU 2026/2027." }),
  academicSource({ cityId: "ostrava", universityId: "osu", facultyId: "osu-lf", url: "https://dokumenty.osu.cz/lf/urednideska/lf-harmonogram-ar-2026-2027.pdf", format: "pdf", coverageStatus: "complete", coverageEvidence: "Oficiální fakultní PDF harmonogram LF OU 2026/2027." }),
];
const ostravaEstablishedSources: RegisteredSource[] = [
  { id: "src-ostrava-osu", cityId: "ostrava", universityId: "osu", facultyId: "osu-ff", sourceType: "academic_calendar", sourceUrl: "https://dokumenty.osu.cz/osu/uredni-deska/ou-harmonogram-akademickeho-roku-2026-2027.pdf", officialDomain: "dokumenty.osu.cz", format: "pdf", parserKey: "pdfjs-academic-calendar", enabled: true, refreshIntervalHours: 168, monitoringMode: "automatic_review", coverageStatus: "covered_by_central", coverageEvidence: "Centrální harmonogram OU 2026/2027 poskytuje společný základ všem fakultám; server zdroje vyžaduje ruční kontrolu.", priority: 90, deepDiscoveryIntervalHours: 168, termsNote: "Oficiální centrální PDF OU; automat nesmí obcházet neplatnou odpověď robots.txt." },
];
const registeredSources: RegisteredSource[] = [
  ...["muni-prav", "muni-lf", "muni-prf", "muni-ff", "muni-pedf", "muni-faf", "muni-esf", "muni-fi", "muni-fss", "muni-fsps"].map((facultyId) => ({
    id: `src-${facultyId}`, universityId: "muni", facultyId, sourceType: "academic_calendar" as const,
    sourceUrl: muniSource, officialDomain: "is.muni.cz", format: "html" as const, parserKey: "muni-is-periods",
    enabled: true, refreshIntervalHours: 24, monitoringMode: "automatic_publish" as const,
    termsNote: "Veřejný strukturovaný přehled harmonogramů období IS MUNI, mapovaný podle fakultních sloupců.",
  })),
  { id: "src-vut-fekt", universityId: "vut", facultyId: "vut-fekt", sourceType: "academic_calendar", sourceUrl: "https://www.vut.cz/uredni-deska/vnitrni-legislativa-fekt/rozhodnuti-s8", officialDomain: "vut.cz", format: "html", parserKey: "linked-document-auto", enabled: true, refreshIntervalHours: 9, monitoringMode: "automatic_publish", discoveryPageLimit: 3, discoveryDepth: 2, termsNote: "Oficiální seznam rozhodnutí FEKT; systém vyhledá aktuální časový plán a projde detail až k PDF příloze." },
  { id: "src-vut-fekt-exams", universityId: "vut", facultyId: "vut-fekt", sourceType: "academic_calendar", sourceUrl: "https://www.vut.cz/uredni-deska/vnitrni-legislativa-fekt/vyhlasky-pro-studenty-s27", officialDomain: "vut.cz", format: "html", parserKey: "linked-document-auto", enabled: true, refreshIntervalHours: 9, monitoringMode: "automatic_publish", discoveryPageLimit: 2, discoveryDepth: 2, termsNote: "Oficiální rozcestník vyhlášek FEKT; systém hledá aktuální plány předmětových zkoušek, zápočtů a kolokvií bez hardcodování PDF." },
  { id: "src-vut-fit", universityId: "vut", facultyId: "vut-fit", sourceType: "academic_calendar", sourceUrl: "https://www.fit.vut.cz/study/calendar/", officialDomain: "fit.vut.cz", format: "html", parserKey: "vut-fit-html", enabled: true, refreshIntervalHours: 24, monitoringMode: "automatic_publish", termsNote: "Veřejný strukturovaný časový plán FIT VUT bez přihlášení." },
  { id: "src-vut-fast", universityId: "vut", facultyId: "vut-fast", sourceType: "academic_calendar", sourceUrl: "https://www.fce.vut.cz/pro-studenty/casovy-plan-studia", officialDomain: "fce.vut.cz", format: "html", parserKey: "linked-document-review", enabled: true, refreshIntervalHours: 24, monitoringMode: "automatic_review", termsNote: "Oficiální časový plán FAST; před publikací se kontroluje konkrétní studijní program." },
  { id: "src-vut-fsi", universityId: "vut", facultyId: "vut-fsi", sourceType: "academic_calendar", sourceUrl: "https://www.fme.vutbr.cz/studenti/plan?degree=0&mode=0", officialDomain: "fme.vutbr.cz", format: "html", parserKey: "vut-fsi-html", enabled: true, refreshIntervalHours: 24, monitoringMode: "automatic_publish", termsNote: "Veřejný časový plán FSI s volbou akademického roku." },
  { id: "src-vut-fa", universityId: "vut", facultyId: "vut-fa", sourceType: "academic_calendar", sourceUrl: "https://www.fa.vut.cz/pages/casovy_plan.aspx", officialDomain: "fa.vut.cz", format: "html", parserKey: "linked-document-review", enabled: true, refreshIntervalHours: 24, monitoringMode: "automatic_review", termsNote: "Oficiální časový plán FA obsahuje roční a oborové termíny; změny před publikací kontroluje editor." },
  { id: "src-vut-fch", universityId: "vut", facultyId: "vut-fch", sourceType: "academic_calendar", sourceUrl: "https://www.vut.cz/uredni-deska/vnitrni-legislativa-fch/vnitrni-normy-sp103", officialDomain: "vut.cz", format: "html", parserKey: "linked-document-auto", enabled: true, refreshIntervalHours: 9, monitoringMode: "automatic_publish", discoveryPageLimit: 2, discoveryDepth: 2, termsNote: "Oficiální vnitřní normy FCH; systém vybere aktuální časový plán a jeho PDF přílohu." },
  { id: "src-vut-fp", universityId: "vut", facultyId: "vut-fp", sourceType: "academic_calendar", sourceUrl: "https://www.vut.cz/uredni-deska/vnitrni-legislativa-fp/rozhodnuti-s56", officialDomain: "vut.cz", format: "html", parserKey: "linked-document-auto", enabled: true, refreshIntervalHours: 9, monitoringMode: "automatic_publish", discoveryPageLimit: 2, discoveryDepth: 2, termsNote: "Oficiální rozhodnutí FP; systém vybere aktuální časový plán a jeho PDF přílohu." },
  { id: "src-vut-favu", universityId: "vut", facultyId: "vut-favu", sourceType: "academic_calendar", sourceUrl: "https://www.favu.vut.cz/studenti/casovy-plan", officialDomain: "favu.vut.cz", format: "html", parserKey: "linked-document-review", enabled: true, refreshIntervalHours: 24, monitoringMode: "automatic_review", termsNote: "Detailní časový plán FaVU obsahuje oborové výjimky; automatické publikování je vypnuté." },
  { id: "src-mendelu-af", universityId: "mendelu", facultyId: "mendelu-af", sourceType: "academic_calendar", sourceUrl: "https://af.mendelu.cz/o-fakulte/uredni-deska/", officialDomain: "af.mendelu.cz", format: "html", parserKey: "linked-document-review", enabled: true, refreshIntervalHours: 9, monitoringMode: "automatic_review", discoveryDepth: 2, termsNote: "Úřední deska AF je sledovaná automaticky; PDF na IS MENDELU respektujeme jako robots.txt blokovaný zdroj." },
  { id: "src-mendelu-ldf", universityId: "mendelu", facultyId: "mendelu-ldf", sourceType: "academic_calendar", sourceUrl: "https://ldf.mendelu.cz/student/harmonogram/", officialDomain: "ldf.mendelu.cz", format: "html", parserKey: "linked-document-review", enabled: true, refreshIntervalHours: 9, monitoringMode: "automatic_review", discoveryDepth: 2, termsNote: "Stránka LDF je sledovaná automaticky; PDF na IS MENDELU respektujeme jako robots.txt blokovaný zdroj." },
  { id: "src-mendelu-pef", universityId: "mendelu", facultyId: "mendelu-pef", sourceType: "academic_calendar", sourceUrl: "https://pef.mendelu.cz/o-fakulte/uredni-deska/", officialDomain: "pef.mendelu.cz", format: "html", parserKey: "mendelu-pef-html", enabled: true, refreshIntervalHours: 24, monitoringMode: "automatic_publish", termsNote: "Veřejná tabulka PEF obsahuje výuku, zkoušky a registrace pro aktuální rok." },
  { id: "src-mendelu-zf", universityId: "mendelu", facultyId: "mendelu-zf", sourceType: "academic_calendar", sourceUrl: "https://zf.mendelu.cz/harmonogram-akademickeho-roku/", officialDomain: "zf.mendelu.cz", format: "html", parserKey: "linked-document-review", enabled: true, refreshIntervalHours: 9, monitoringMode: "automatic_review", discoveryDepth: 2, termsNote: "Stránka ZF je sledovaná automaticky; PDF na IS MENDELU respektujeme jako robots.txt blokovaný zdroj." },
  { id: "src-mendelu-frrms", universityId: "mendelu", facultyId: "mendelu-frrms", sourceType: "academic_calendar", sourceUrl: "https://frrms.mendelu.cz/student/prakticke-informace/", officialDomain: "frrms.mendelu.cz", format: "html", parserKey: "generic-academic-html", enabled: true, refreshIntervalHours: 9, monitoringMode: "automatic_review", termsNote: "Veřejný harmonogram FRRMS je dostupný v praktických informacích; kvůli případným nejednoznačnostem zůstává v bezpečné kontrole." },
  { id: "src-vetuni-fvl", universityId: "vetuni", facultyId: "vetuni-fvl", sourceType: "academic_calendar", sourceUrl: "https://www.vetuni.cz/Rozpis_vyuky_pro_akademicky_rok", officialDomain: "vetuni.cz", format: "html", parserKey: "linked-document-review", enabled: true, refreshIntervalHours: 24, monitoringMode: "automatic_review", termsNote: "Stabilní oficiální rozcestník každoročně odkazuje na společný PDF rozpis výuky VETUNI." },
  { id: "src-vetuni-fvhe", universityId: "vetuni", facultyId: "vetuni-fvhe", sourceType: "academic_calendar", sourceUrl: "https://www.vetuni.cz/Rozpis_vyuky_pro_akademicky_rok", officialDomain: "vetuni.cz", format: "html", parserKey: "linked-document-review", enabled: true, refreshIntervalHours: 24, monitoringMode: "automatic_review", termsNote: "Stabilní oficiální rozcestník každoročně odkazuje na společný PDF rozpis výuky VETUNI." },
  { id: "src-jamu-hf", universityId: "jamu", facultyId: "jamu-hf", sourceType: "academic_calendar", sourceUrl: "https://is.jamu.cz/predmety/obdobi", officialDomain: "is.jamu.cz", format: "html", parserKey: "jamu-is-periods", enabled: true, refreshIntervalHours: 24, monitoringMode: "automatic_publish", termsNote: "Veřejný strukturovaný přehled harmonogramů IS JAMU, sloupec Hudební fakulty." },
  { id: "src-jamu-df", universityId: "jamu", facultyId: "jamu-df", sourceType: "academic_calendar", sourceUrl: "https://is.jamu.cz/predmety/obdobi", officialDomain: "is.jamu.cz", format: "html", parserKey: "jamu-is-periods", enabled: true, refreshIntervalHours: 24, monitoringMode: "automatic_publish", termsNote: "Veřejný strukturovaný přehled harmonogramů IS JAMU, sloupec Divadelní fakulty." },
  ...["upol-cmtf", "upol-lf", "upol-ff", "upol-prf", "upol-pdf", "upol-ftk", "upol-pf", "upol-fzv"].map((facultyId) => academicSource({
    cityId: "olomouc", universityId: "upol", facultyId,
    url: "https://www.upol.cz/studenti/studium/harmonogram-akademickeho-roku/",
    parserKey: "upol-academic-html", monitoringMode: "automatic_publish",
    coverageStatus: "covered_by_central",
    coverageEvidence: "Strukturovaný centrální harmonogram UP 2026/2027 obsahuje společné i fakultně rozlišené termíny.",
    refreshIntervalHours: 24,
  })),
  { id: "src-ostrava-vsbtuo", cityId: "ostrava", universityId: "vsbtuo", facultyId: "vsbtuo-hgf", sourceType: "academic_calendar", sourceUrl: "https://www.vsb.cz/cs/student/harmonogram/?academicYear=2026", officialDomain: "vsb.cz", format: "html", parserKey: "generic-academic-html", enabled: true, refreshIntervalHours: 9, monitoringMode: "automatic_review", termsNote: "Centrální oficiální harmonogram VŠB-TUO 2026/2027; změny před zveřejněním kontroluje editor." },
  { id: "src-ostrava-osu-prf", cityId: "ostrava", universityId: "osu", facultyId: "osu-prf", sourceType: "academic_calendar", sourceUrl: "https://dokumenty.osu.cz/prf/urednideska/prf-harmonogram-2026-2027.pdf", officialDomain: "dokumenty.osu.cz", format: "pdf", parserKey: "pdfjs-academic-calendar", enabled: true, refreshIntervalHours: 9, monitoringMode: "automatic_review", coverageStatus: "complete", coverageEvidence: "Oficiální fakultní PDF harmonogram PřF OU 2026/2027.", termsNote: "Oficiální harmonogram PřF OU 2026/2027; PDF změny musí projít ruční kontrolou." },
  { id: "src-ostrava-osu-fss", cityId: "ostrava", universityId: "osu", facultyId: "osu-fss", sourceType: "academic_calendar", sourceUrl: "https://dokumenty.osu.cz/fss/urednideska/harmonogram-akademickeho-roku-fss-2026-2027.pdf", officialDomain: "dokumenty.osu.cz", format: "pdf", parserKey: "pdfjs-academic-calendar", enabled: true, refreshIntervalHours: 9, monitoringMode: "automatic_review", coverageStatus: "complete", coverageEvidence: "Oficiální fakultní PDF harmonogram FSS OU 2026/2027.", termsNote: "Oficiální harmonogram FSS OU 2026/2027; PDF změny musí projít ruční kontrolou." },
  ...brnoEstablishedSources,
  ...pragueEstablishedSources,
  ...pragueAcademicSources,
  ...ostravaEstablishedSources,
  ...ostravaAcademicSources,
  { id: "src-fajn-brigady", cityId: "brno", universityId: "", facultyId: "", sourceType: "job_feed", sourceUrl: "https://www.fajn-brigady.cz/vysledek.html?s_sekce=1&id_lokality=okres-3702", officialDomain: "media.fajnsprava.cz", allowedDomains: ["media.fajnsprava.cz", "fajn-brigady.cz"], format: "xml", parserKey: "fajn-v2-xml", enabled: true, refreshIntervalHours: fajnFeedConfig().intervalHours, monitoringMode: "automatic_publish", termsNote: "Smluvní XML feed Fajn brigády. Skutečná adresa feedu je pouze v serverovém prostředí a testovací inzeráty se nepublikují." },
  { id: "src-fajn-brigady-praha", cityId: "praha", universityId: "", facultyId: "", sourceType: "job_feed", sourceUrl: "https://www.fajn-brigady.cz/brigady/praha/", officialDomain: "media.fajnsprava.cz", allowedDomains: ["media.fajnsprava.cz", "fajn-brigady.cz"], format: "xml", parserKey: "fajn-v2-xml", enabled: true, refreshIntervalHours: fajnFeedConfig("praha").intervalHours, monitoringMode: "automatic_publish", termsNote: "Smluvní XML feed Fajn brigády pro Prahu. Adresa feedu zůstává v serverovém prostředí." },
  { id: "src-fajn-brigady-ostrava", cityId: "ostrava", universityId: "", facultyId: "", sourceType: "job_feed", sourceUrl: "https://www.fajn-brigady.cz/brigady/ostrava/", officialDomain: "media.fajnsprava.cz", allowedDomains: ["media.fajnsprava.cz", "fajn-brigady.cz"], format: "xml", parserKey: "fajn-v2-xml", enabled: true, refreshIntervalHours: fajnFeedConfig("ostrava").intervalHours, monitoringMode: "automatic_publish", termsNote: "Smluvní XML feed Fajn brigády pro Ostravu. Adresa feedu zůstává v serverovém prostředí." },
  { id: "src-fajn-brigady-olomouc", cityId: "olomouc", universityId: "", facultyId: "", sourceType: "job_feed", sourceUrl: "https://www.fajn-brigady.cz/brigady/olomouc/", officialDomain: "media.fajnsprava.cz", allowedDomains: ["media.fajnsprava.cz", "fajn-brigady.cz"], format: "xml", parserKey: "fajn-v2-xml", enabled: true, refreshIntervalHours: fajnFeedConfig("olomouc").intervalHours, monitoringMode: "automatic_publish", termsNote: "Smluvní XML feed Fajn brigády pro Olomouc. Adresa feedu zůstává v serverovém prostředí." },
];

export const contentSources: ContentSource[] = registeredSources.map((source) => ({
  ...source,
  allowedDomains: source.allowedDomains || (source.universityId === "muni" ? ["muni.cz"] : source.universityId === "vut" ? ["vut.cz", "vutbr.cz"] : source.universityId === "mendelu" ? ["mendelu.cz"] : source.universityId === "vetuni" ? ["vetuni.cz"] : source.universityId === "upol" ? ["upol.cz"] : source.universityId === "vsbtuo" ? ["vsb.cz"] : source.universityId === "osu" ? ["osu.cz"] : source.universityId === "cuni" ? ["cuni.cz"] : source.universityId === "cvut" ? ["cvut.cz"] : source.universityId === "vse" ? ["vse.cz"] : source.universityId === "czu" ? ["czu.cz"] : source.universityId === "vscht" ? ["vscht.cz"] : ["jamu.cz"]),
  academicYear: source.sourceUrl.match(/20\d{2}[-_/](?:20)?\d{2}/)?.[0]?.replace(/[-_]/g, "/").replace(/\/(\d{2})$/, (_match, year: string) => `/${String(Number(year.slice(0, 2)) + 2000)}`) || null,
  confidence: source.monitoringMode === "automatic_publish" ? 0.96 : source.monitoringMode === "not_found_monitored" ? 0 : 0.6,
  requiresReview: source.monitoringMode !== "automatic_publish",
  notes: source.termsNote,
  sourceDocumentTitle: source.format === "pdf" ? "Oficiální harmonogram akademického roku" : undefined,
}));

export function sourceById(id: string) { return contentSources.find((source) => source.id === id); }
export function allowedSourceHosts() { return new Set(contentSources.flatMap((source) => [new URL(source.sourceUrl).hostname.toLowerCase(), ...(source.allowedDomains || [])])); }
