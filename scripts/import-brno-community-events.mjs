#!/usr/bin/env node
/*
 * Idempotentní import ověřených veřejných akcí do „Co se děje“.
 *
 * Výchozí režim je preview. Zápis do Supabase vyžaduje explicitní --apply a
 * používá pouze SUPABASE_SERVICE_ROLE_KEY na serveru/localhostu. Import nikdy
 * nemaže komunitní obsah ani nepřepisuje archivované nebo skryté záznamy.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const APPLY = process.argv.includes("--apply");
const CHECKED_AT = new Date().toISOString();

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).map((line) => line.match(/^([^#=]+)=(.*)$/)).filter(Boolean).map((match) => [match[1].trim(), match[2].trim().replace(/^['\"]|['\"]$/g, "")]));
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function preservedPublicationStatus(status) {
  return ["hidden", "archived", "deleted"].includes(status) ? status : "published";
}
function importChangeKind(existing, sourceContentHash) {
  if (!existing) return "inserted";
  return existing.source_content_hash === sourceContentHash ? "unchanged" : "updated";
}
function stableUuid(value) {
  const hex = sha256(value).slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

const events = [
  {
    externalId: "mendelu-run-2026",
    title: "Běh MENDELU 2026",
    category: "Sport a pohyb",
    startsAt: "2026-09-26T08:30:00+02:00",
    endsAt: null,
    venue: "Botanická zahrada a arboretum MENDELU, třída Generála Píky 1, Brno",
    description: "Univerzitní běžecký den s hlavním závodem pro studenty a zaměstnance, dětskými běhy a štafetou.",
    isFree: false,
    eventUrl: "https://beh.mendelu.cz/article/registrace-na-beh-mendelu-2026-je-registrace-spustena",
    sourceUrl: "https://beh.mendelu.cz/propozice",
    organizer: "Mendelova univerzita v Brně",
    universityId: "mendelu",
    facultyId: null,
    attendanceMode: "in_person"
  },
  {
    externalId: "mendelu-bitter-truth-2026",
    title: "Bitter Truth, Sweet Chocolate",
    category: "Workshop a přednáška",
    startsAt: "2026-09-29T13:00:00+02:00",
    endsAt: "2026-09-29T15:00:00+02:00",
    venue: "PEF MENDELU, Q22, Zemědělská 1, Brno",
    description: "Anglické setkání o odpovědném obchodu s kakaem, etických dodavatelských řetězcích a udržitelném podnikání.",
    isFree: true,
    eventUrl: "https://mendelu.cz/akce/bitter-truth-sweet-chocolate/",
    sourceUrl: "https://mendelu.cz/akce/bitter-truth-sweet-chocolate/",
    organizer: "CSR MENDELU",
    universityId: "mendelu",
    facultyId: "mendelu-pef",
    attendanceMode: "in_person"
  },
  {
    externalId: "fekt-den-nabity-energii-2026",
    title: "Den nabitý energií",
    category: "Kariéra a brigády",
    startsAt: "2026-09-30T09:00:00+02:00",
    endsAt: "2026-09-30T15:00:00+02:00",
    venue: "FEKT VUT, před budovou T12, Technická 12, Brno",
    description: "Kariérní a technologické setkání EG.D a E.ON přímo na fakultě, s ukázkou elektromobilu a moderní distribuční sítě.",
    isFree: true,
    eventUrl: "https://www.fekt.vut.cz/o_fakulte/akce/361539",
    sourceUrl: "https://www.fekt.vut.cz/o_fakulte/akce/361539",
    organizer: "Fakulta elektrotechniky a komunikačních technologií VUT",
    universityId: "vut",
    facultyId: "vut-fekt",
    attendanceMode: "in_person"
  },
  {
    externalId: "mendelu-pefday-2026",
    title: "PEFday 2026",
    category: "Studentské spolky",
    startsAt: "2026-09-30T14:30:00+02:00",
    endsAt: "2026-09-30T17:00:00+02:00",
    venue: "Atrium budovy Q, MENDELU, Zemědělská 1, Brno",
    description: "Neformální studentské odpoledne s hudbou, aktivitami, jídlem a pitím zdarma v areálu PEF MENDELU.",
    isFree: true,
    eventUrl: "https://mendelu.cz/akce/pefday-2026/",
    sourceUrl: "https://mendelu.cz/akce/pefday-2026/",
    organizer: "Provozně ekonomická fakulta MENDELU",
    universityId: "mendelu",
    facultyId: "mendelu-pef",
    attendanceMode: "in_person"
  },
  {
    externalId: "mendelu-kratce-a-modre-2026",
    title: "Krátce a modře se Studentskou porotou",
    category: "Kultura",
    startsAt: "2026-09-30T19:00:00+02:00",
    endsAt: null,
    venue: "S-klub, třída Generála Píky 2005/7, Brno",
    description: "Projekce soutěžních krátkých filmů v rámci EKOFILMu s diskusí Studentské poroty v češtině i angličtině.",
    isFree: true,
    eventUrl: "https://mendelu.cz/akce/kratce-a-modre-se-studentskou-porotou/",
    sourceUrl: "https://mendelu.cz/akce/kratce-a-modre-se-studentskou-porotou/",
    organizer: "Mendelova univerzita v Brně",
    universityId: "mendelu",
    facultyId: "mendelu-frrms",
    attendanceMode: "in_person"
  },
  {
    externalId: "mendelu-barvy-podzimu-2026",
    title: "Barvy podzimu",
    category: "Kultura",
    startsAt: "2026-10-16T09:00:00+02:00",
    endsAt: "2026-10-19T18:00:00+02:00",
    venue: "Botanická zahrada a arboretum MENDELU, třída Generála Píky 1, Brno",
    description: "Podzimní výstava v arboretu MENDELU s prohlídkou zahrady, skleníků a možností komentovaných prohlídek.",
    isFree: false,
    priceAmount: 70,
    eventUrl: "https://arboretum.mendelu.cz/akce/barvy-podzimu-2/",
    sourceUrl: "https://arboretum.mendelu.cz/akce/barvy-podzimu-2/",
    organizer: "Botanická zahrada a arboretum MENDELU",
    universityId: "mendelu",
    facultyId: null,
    attendanceMode: "in_person"
  },
  {
    externalId: "mendelu-studentske-stredy-filipiny-2026",
    title: "Studentské středy: Filipíny na vlastní kůži",
    category: "Studentské spolky",
    startsAt: "2026-10-21T18:00:00+02:00",
    endsAt: "2026-10-21T22:00:00+02:00",
    venue: "S-klub, MENDELU, Brno",
    description: "Neformální setkání se studenty a akademiky o výjezdech na Filipíny, s ochutnávkou a stolním fotbálkem.",
    isFree: true,
    eventUrl: "https://mendelu.cz/akce/studentske-stredy-filipiny-na-vlastni-kuzi-21-10/",
    sourceUrl: "https://mendelu.cz/akce/studentske-stredy-filipiny-na-vlastni-kuzi-21-10/",
    organizer: "FRRMS MENDELU",
    universityId: "mendelu",
    facultyId: "mendelu-frrms",
    attendanceMode: "in_person"
  },
  {
    externalId: "mendelu-mindfest-2026",
    title: "MENDELU MIND FEST 2026: Co dává smysl?",
    category: "Wellbeing a zdraví",
    startsAt: "2026-10-22T08:30:00+02:00",
    endsAt: null,
    venue: "Institut celoživotního vzdělávání MENDELU, Zemědělská 5, Brno",
    description: "Dva dny přednášek, workshopů a zážitkových aktivit o duševním zdraví; vstup je zdarma po registraci.",
    isFree: true,
    eventUrl: "https://icv.mendelu.cz/pcentrum/mindfest/",
    sourceUrl: "https://icv.mendelu.cz/pcentrum/mindfest/",
    organizer: "Institut celoživotního vzdělávání MENDELU",
    universityId: "mendelu",
    facultyId: null,
    attendanceMode: "in_person"
  },
  {
    externalId: "muni-proteiny-prickle-2026",
    title: "Proteiny Prickle nejen v neurulaci obratlovců",
    category: "Technologie a věda",
    startsAt: "2026-10-02T10:00:00+02:00",
    endsAt: "2026-10-02T11:30:00+02:00",
    venue: "Masarykova univerzita, Brno (místo dle detailu pořadatele)",
    description: "Odborná přednáška o proteinech Prickle a jejich roli ve vývoji nervové soustavy obratlovců.",
    isFree: true,
    eventUrl: "https://www.muni.cz/kalendar/u/1755189u-proteiny-prickle-nejen-v-neurulaci-obratlovcu",
    sourceUrl: "https://www.muni.cz/kalendar/u/1755189u-proteiny-prickle-nejen-v-neurulaci-obratlovcu",
    organizer: "Masarykova univerzita",
    universityId: "muni",
    facultyId: "muni-prf",
    attendanceMode: "in_person"
  },
  {
    externalId: "muni-life-science-transfer-academy-2026",
    title: "Life Science Transfer Academy – From Discovery to Innovation",
    category: "Technologie a věda",
    startsAt: "2026-09-30T13:00:00+02:00",
    endsAt: "2026-12-02T17:00:00+01:00",
    venue: "CEITEC Masarykovy univerzity, Brno",
    description: "Vzdělávací program s osmi středečními bloky o transferu technologií, vedený v angličtině; registrace je nutná.",
    isFree: true,
    eventUrl: "https://www.muni.cz/kalendar/u/1684109u-life-science-transfer-academy-from-discovery-to-innovation",
    sourceUrl: "https://www.muni.cz/kalendar/u/1684109u-life-science-transfer-academy-from-discovery-to-innovation",
    organizer: "Masarykova univerzita, CEITEC a JIC",
    universityId: "muni",
    facultyId: null,
    attendanceMode: "in_person"
  },
  {
    externalId: "muni-gentlemanstvi-v-jazyce-2026",
    title: "Gentlemanství v jazyce",
    category: "Workshop a přednáška",
    startsAt: "2026-11-04T16:00:00+01:00",
    endsAt: null,
    venue: "Aula budovy C, Arna Nováka 1, Brno",
    description: "Přednáška o zdvořilosti v češtině a angličtině v cyklu Otevřený svět humanitních věd.",
    isFree: true,
    eventUrl: "https://www.muni.cz/kalendar/u/1757059u-gentlemanstvi-v-jazyce",
    sourceUrl: "https://www.muni.cz/kalendar/u/1757059u-gentlemanstvi-v-jazyce",
    organizer: "Filozofická a Pedagogická fakulta MU",
    universityId: "muni",
    facultyId: null,
    attendanceMode: "in_person"
  },
  {
    externalId: "muni-lekarske-pristroje-2026",
    title: "Lékařské přístroje aneb zdravotnické prostředky očima biofyziky",
    category: "Technologie a věda",
    startsAt: "2026-11-03T17:00:00+01:00",
    endsAt: "2026-11-03T18:00:00+01:00",
    venue: "Online kurz Masarykovy univerzity",
    description: "Online přednáška o zdravotnických prostředcích a biofyzice, dostupná po registraci.",
    isFree: true,
    eventUrl: "https://www.muni.cz/kalendar/u/1662597u-lekarske-pristroje-aneb-zdravotnicke-prostredky-ocima-biofyziky",
    sourceUrl: "https://www.muni.cz/kalendar/u/1662597u-lekarske-pristroje-aneb-zdravotnicke-prostredky-ocima-biofyziky",
    organizer: "Lékařská fakulta MU",
    universityId: "muni",
    facultyId: "muni-lf",
    attendanceMode: "online"
  },
  {
    externalId: "vut-fast-sanace-crrb-2026",
    title: "Sanace a rekonstrukce staveb & CRRB",
    category: "Technologie a věda",
    startsAt: "2026-11-12T12:00:00+01:00",
    endsAt: "2026-11-13T12:00:00+01:00",
    venue: "Fakulta stavební VUT v Brně",
    description: "48. konference o sanacích a rekonstrukcích staveb pořádaná FAST VUT s odbornými partnery.",
    isFree: false,
    eventUrl: "https://www.fce.vut.cz/o-fakulte/akce/konference-sanace-a-rekonstrukce-staveb-amp-crrb-8505",
    sourceUrl: "https://www.fce.vut.cz/o-fakulte/akce/konference-sanace-a-rekonstrukce-staveb-amp-crrb-8505",
    organizer: "Fakulta stavební VUT a WTA CZ",
    universityId: "vut",
    facultyId: "vut-fast",
    attendanceMode: "in_person"
  },
  {
    externalId: "mendelu-mezigeneracni-konference-2026",
    title: "Generace spolu: jak tvořit mezigenerační programy",
    category: "Workshop a přednáška",
    startsAt: "2026-11-10T09:30:00+01:00",
    endsAt: "2026-11-10T16:00:00+01:00",
    venue: "Institut celoživotního vzdělávání MENDELU, Zemědělská 5, Brno",
    description: "Bezplatná konference s příklady dobré praxe, workshopy a networkingem o mezigeneračním vzdělávání.",
    isFree: true,
    eventUrl: "https://icv.mendelu.cz/seniorske-vzdelavani/u3v/projekty-univerzity-tretiho-veku/mezigeneracni-konference/",
    sourceUrl: "https://icv.mendelu.cz/seniorske-vzdelavani/u3v/projekty-univerzity-tretiho-veku/mezigeneracni-konference/",
    organizer: "Institut celoživotního vzdělávání MENDELU",
    universityId: "mendelu",
    facultyId: null,
    attendanceMode: "in_person"
  },
  {
    externalId: "fekt-perfekt-den-otevrenych-dveri-2026",
    title: "PerFEKTní den otevřených dveří",
    category: "Studium a vzdělávání",
    startsAt: "2026-11-27T09:00:00+01:00",
    endsAt: "2026-11-27T15:00:00+01:00",
    venue: "FEKT VUT, Technická 12, Brno",
    description: "Den otevřených dveří FEKT s infostánky, programovými prezentacemi a komentovanými prohlídkami laboratoří.",
    isFree: true,
    eventUrl: "https://www.fekt.vut.cz/o_fakulte/akce/355688",
    sourceUrl: "https://www.fekt.vut.cz/o_fakulte/akce/355688",
    organizer: "Fakulta elektrotechniky a komunikačních technologií VUT",
    universityId: "vut",
    facultyId: "vut-fekt",
    attendanceMode: "in_person"
  },
  {
    externalId: "muni-etika-publikovani-2027",
    title: "Etika publikování a citování",
    category: "Studium a vzdělávání",
    startsAt: "2027-01-19T17:00:00+01:00",
    endsAt: "2027-01-19T18:00:00+01:00",
    venue: "Online přes MS Teams",
    description: "Online kurz o publikační a citační etice, správném citování a prevenci plagiátorství.",
    isFree: true,
    eventUrl: "https://www.muni.cz/kalendar/u/1725613u-etika-publikovani-a-citovani",
    sourceUrl: "https://www.muni.cz/kalendar/u/1725613u-etika-publikovani-a-citovani",
    organizer: "Juniorská akademie MED MUNI",
    universityId: "muni",
    facultyId: "muni-lf",
    attendanceMode: "online"
  },
  {
    externalId: "mendelu-frrms-den-otevrenych-dveri-2027-01",
    title: "Den otevřených dveří FRRMS MENDELU",
    category: "Studium a vzdělávání",
    startsAt: "2027-01-29T09:00:00+01:00",
    endsAt: "2027-01-29T13:00:00+01:00",
    venue: "FRRMS MENDELU, Brno",
    description: "Den otevřených dveří s představením studia, fakulty a studentského života na FRRMS MENDELU.",
    isFree: true,
    eventUrl: "https://mendelu.cz/uchazec/dulezite-terminy/",
    sourceUrl: "https://mendelu.cz/uchazec/dulezite-terminy/",
    organizer: "Fakulta regionálního rozvoje a mezinárodních studií MENDELU",
    universityId: "mendelu",
    facultyId: "mendelu-frrms",
    attendanceMode: "in_person"
  },
  {
    externalId: "mendelu-frrms-den-otevrenych-dveri-2027-02",
    title: "Den otevřených dveří FRRMS MENDELU",
    category: "Studium a vzdělávání",
    startsAt: "2027-02-26T09:00:00+01:00",
    endsAt: "2027-02-26T14:00:00+01:00",
    venue: "FRRMS MENDELU, Brno",
    description: "Druhý termín dne otevřených dveří FRRMS s informacemi o programech a studentském životě.",
    isFree: true,
    eventUrl: "https://mendelu.cz/uchazec/dulezite-terminy/",
    sourceUrl: "https://mendelu.cz/uchazec/dulezite-terminy/",
    organizer: "Fakulta regionálního rozvoje a mezinárodních studií MENDELU",
    universityId: "mendelu",
    facultyId: "mendelu-frrms",
    attendanceMode: "in_person"
  }
];

async function checkSource(url) {
  const response = await fetch(url, { redirect: "follow", headers: { "user-agent": "StudentHubBrno/1.0 (+https://studenthubapp.cz/kontakt)", accept: "text/html,application/xhtml+xml,application/pdf" } });
  const contentType = response.headers.get("content-type") || "";
  return { ok: response.ok && (/text\/html|application\/pdf|application\/xhtml\+xml/i.test(contentType)), status: response.status, finalUrl: response.url, contentType };
}

function row(event) {
  const duplicateFingerprint = sha256(["brno", event.title, event.startsAt, event.venue, event.organizer].join("|"));
  return {
    id: stableUuid(`community-event:${event.externalId}`), city_id: "brno", title: event.title, category: event.category,
    starts_at: event.startsAt, ends_at: event.endsAt, venue: event.venue, description: event.description,
    is_free: event.isFree, price_amount: event.isFree ? null : (event.priceAmount || null), currency: "CZK",
    event_url: event.eventUrl, duplicate_fingerprint: duplicateFingerprint,
    status: "published", report_count: 0, organizer: event.organizer, source_type: "external", source_url: event.sourceUrl,
    source_external_id: event.externalId, last_verified_at: CHECKED_AT, source_sync_status: "verified", source_miss_count: 0,
    source_content_hash: sha256(JSON.stringify(event)), university_id: event.universityId, faculty_id: event.facultyId,
    attendance_mode: event.attendanceMode
  };
}

async function main() {
  const checked = [];
  for (const event of events) {
    const source = await checkSource(event.sourceUrl).catch((error) => ({ ok: false, status: 0, finalUrl: event.sourceUrl, contentType: String(error) }));
    checked.push({ event, source, row: row(event) });
  }
  const unavailable = checked.filter((item) => !item.source.ok);
  const usable = checked.filter((item) => item.source.ok);
  const preview = { mode: APPLY ? "apply" : "preview", checkedAt: CHECKED_AT, total: events.length, usable: usable.length, unavailable: unavailable.length, duplicateFingerprints: new Set(usable.map((item) => item.row.duplicate_fingerprint)).size, sources: checked.map(({ event, source }) => ({ externalId: event.externalId, sourceUrl: event.sourceUrl, status: source.status, finalUrl: source.finalUrl, mime: source.contentType, ok: source.ok })) };
  if (!APPLY) { console.log(JSON.stringify(preview, null, 2)); return; }
  if (unavailable.length) throw new Error(`Import zastaven: ${unavailable.length} zdrojů neprošlo kontrolou.`);
  const env = parseEnv(await readFile(".env.local", "utf8"));
  const base = env.NEXT_PUBLIC_SUPABASE_URL; const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Chybí Supabase URL nebo service-role klíč v .env.local.");
  const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=minimal" };
  let inserted = 0; let updated = 0; let skipped = 0;
  for (const item of usable) {
    const lookup = await fetch(`${base}/rest/v1/community_events?select=id,status,source_content_hash&city_id=eq.brno&source_type=eq.external&source_external_id=eq.${encodeURIComponent(item.event.externalId)}`, { headers });
    if (!lookup.ok) throw new Error(`Čtení ${item.event.externalId} selhalo: HTTP ${lookup.status}`);
    const existing = await lookup.json();
    const changeKind = importChangeKind(existing[0], item.row.source_content_hash);
    const payload = { ...item.row, status: preservedPublicationStatus(existing[0]?.status) };
    const endpoint = existing.length
      ? `${base}/rest/v1/community_events?id=eq.${encodeURIComponent(existing[0].id)}`
      : `${base}/rest/v1/community_events`;
    const response = await fetch(endpoint, {
      method: existing.length ? "PATCH" : "POST",
      headers,
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 800);
      throw new Error(`Zápis ${item.event.externalId} selhal: HTTP ${response.status} ${detail}`);
    }
    if (changeKind === "unchanged") skipped += 1; else if (changeKind === "updated") updated += 1; else inserted += 1;
  }
  console.log(JSON.stringify({ ...preview, inserted, updated, unchanged: skipped, archived: 0 }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}

export { events, importChangeKind, preservedPublicationStatus, row };
