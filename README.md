# StudentHub Brno

Nezávislá PWA pro studenty všech brněnských vysokých škol, připravená k produkčnímu nasazení po dokončení checklistu v tomto dokumentu. Spojuje ověřené veřejné akademické termíny, užitečná místa, brigády, moderované žádosti o lokální pomoc, hledání parťáků a bezpečnou Studentskou komunitu. Není oficiální službou žádné univerzity a nepřihlašuje se do školních informačních systémů.

## Co aplikace obsahuje

- personalizovaný dashboard bez registrace pro MUNI, VUT, MENDELU, VETUNI a JAMU;
- 27 fakult a městské routy `/brno`, `/brno/kalendar`, `/brno/mista`, `/brno/brigady` a `/brno/skoly/<škola>`; původní URL bezpečně přesměrovávají a vypnutá `/brno/nabidky` vede na přehled;
- fakultní kalendář s validovanými URL parametry (`?university=muni&faculty=muni-fi&year=2`), volitelným ročníkem 1–6, sjednocením univerzitních a fakultních termínů, odkazem na zdroj, sdílením, Google Calendar a korektním `.ics` exportem;
- povinný sekvenční onboarding města/školy/fakulty bez registrace, vědomé pokračování pro celé město a aktuální studijní kontext pod značkou v desktopové i mobilní navigaci;
- Leaflet/OpenStreetMap mapu i plně použitelný seznam ověřených míst;
- brigády s moderací, expirací a označením zvýraznění; modul nabídek zůstává v kódu a databázi, ale ve veřejném webu je výchozím produkčním příznakem vypnutý;
- moderované veřejné žádosti o lokální pomoc s neveřejnými kontakty, filtry, vlastnickým tokenem, úpravou/smazáním a hlášením;
- sekci „Hledám parťáka“ pro ověřené Supabase účty s filtry, kapacitou, žádostmi o připojení, expirací, moderací a bezpečnostními doporučeními;
- sekci `/komunita` s průběžně stránkovaným feedem, školními filtry, komentáři, reakcemi „Užitečné“, nejužitečnější odpovědí, obrázkem po bezpečné konverzi a moderací po nahlášení;
- návrhy studentských spolků s fakultním rozsahem a serverovou validací;
- administraci pro role `super_admin`, brněnský `admin`, městsky omezený `city_editor` a fakultně omezený `faculty_editor`;
- registr zdrojů, synchronizační historii, snapshoty, frontu nejistých změn a kontrolu odkazů;
- privacy-first návštěvnost 7/30/90 dnů pouze po opt-in, správu administrátorů hlavním superadminem, tři režimy motivu, SEO a bezpečnostní hlavičky;
- instalovatelnou PWA: Chrome/Edge používají `beforeinstallprompt`, iOS/iPadOS a vestavěné prohlížeče dostanou přizpůsobený návod. Instalační položka je v desktopovém i mobilním menu a na stránce Místa.

Service worker používá verzovanou cache jen pro `/_next/static/`, fonty a vlastní brand obrázky. Navigace se vždy načítá ze sítě a při výpadku vrátí pouze `offline.html`; `/admin`, `/api`, `/auth`, účty a soukromé přehledy se nikdy necachují. Aktualizace workeru nevyvolává automatický reload, takže nemůže vzniknout obnovovací smyčka.

Veřejné UI nikdy nepoužívá falešné partnery, brigády ani „výplňové“ akademické termíny. Nabídky jsou ve veřejném webu vypnuté a brigády jsou po čisté instalaci prázdné. Ověřený seed obsahuje jen ručně ověřené veřejné termíny, skutečné veřejné akce a reálná místa s odkazy na zdroje.

## Požadavky

- Node.js 22.13+
- pnpm 11.9+
- pro produkci Supabase/PostgreSQL a účet Vercel

## Lokální spuštění

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm dev
```

Otevřete `http://localhost:3000`. Bez Supabase veřejné kolekce zůstanou prázdné. Chcete-li při lokálním vývoji zobrazit pouze kurátorovaný balík ověřených veřejných záznamů a ukládat formuláře do `.data/local-test-store.json`, nastavte výslovně:

```dotenv
DEMO_MODE=true
ALLOW_LOCAL_FILE_STORE=true
ALLOW_VERIFIED_FALLBACK=true
ADMIN_DEMO_PASSWORD=nejmene-12-znaku-pro-lokalni-test
ADMIN_COOKIE_SECRET=nejmene-32-nahodnych-znaku-pro-lokalni-test
```

Tento režim je pouze pro lokální testování. Produkční hodnoty všech tří přepínačů jsou `false`.

## Proměnné prostředí

| Proměnná | Kde | Povinná v produkci | Účel |
|---|---|---:|---|
| `NEXT_PUBLIC_SITE_URL` | klient/server | ano | canonical URL, sitemap a Open Graph |
| `DEFAULT_CITY_SLUG` / `NEXT_PUBLIC_DEFAULT_CITY_SLUG` | server / klient | ano | výchozí edice; nyní vždy `brno` |
| `MULTI_CITY_ENABLED` / `NEXT_PUBLIC_MULTI_CITY_ENABLED` | server / klient | ano | globální pojistka; dokud je veřejné jen Brno, ponechat `false` |
| `PUBLISHED_CITY_SLUGS` | pouze server | ano | čárkami oddělená allowlist edic pro časnou HTTP 404; musí odpovídat publikovaným městům v DB |
| `NEXT_PUBLIC_SUPABASE_URL` | klient/server | ano | URL Supabase projektu |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | klient/server | ano | veřejný anon klíč, chráněný RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | pouze server | ano | serverové formuláře, synchronizace a administrace; nikdy ne do klienta |
| `SUPERADMIN_EMAIL` | pouze lokální CLI | při prvním účtu | skutečný e-mail pro jednorázovou pozvánku; nepřidávat do Vercelu ani repozitáře |
| `CRON_SECRET` | pouze server | ano | Bearer autorizace obou cron endpointů |
| `RATE_LIMIT_SALT` | pouze server | ano | pseudonymizace IP pro lokální rate limit |
| `SYNC_USER_AGENT` | server | ano | identifikace slušného crawleru s kontaktem |
| `NEXT_PUBLIC_ADS_ENABLED` | klient/build | ne | `true` pouze po obchodním a cookie nastavení |
| `NEXT_PUBLIC_OFFERS_ENABLED` | klient/build | ne | jediný veřejný příznak modulu nabídek; v produkci ponechat `false` |
| `NEXT_PUBLIC_CONTACT_EMAIL` | build | doporučeno | veřejný kontakt |
| `NEXT_PUBLIC_PARTNER_EMAIL` | build | doporučeno | kontakt pro partnery |
| `CONTACT_TO_EMAIL` / `CONTACT_FROM_EMAIL` | pouze server | ano pro formulář | pevný příjemce a ověřená odesílací identita; e-mail návštěvníka se používá jen jako Reply-To |
| `RESEND_API_KEY` | pouze server | ano pro formulář | serverové doručení kontaktní zprávy; nikdy ne do klienta |
| `FAJN_BRIGADY_FEED_ENABLED` | server | ne | výchozí `false`; autorizovaný import se spustí jen spolu s potvrzením oprávnění a platnou URL |
| `FAJN_BRIGADY_PERMISSION_CONFIRMED` | server | ne | musí být `true` až po písemném oprávnění; samotný feed flag nestačí |
| `FAJN_BRIGADY_FEED_URL` | pouze server | ne | tajná HTTPS URL smluvního XML feedu na povolené doméně; veřejná ukázka je výslovně odmítnuta |
| `FAJN_BRIGADY_SYNC_INTERVAL_HOURS` | server | ne | interval 1–10 hodin, výchozí `9` |
| `FAJN_BRIGADY_FEED_MODE` | server | ne | bezpečné `incremental`; `full_snapshot` až po písemném potvrzení úplnosti feedu |
| `ISIC_FEED_ENABLED` / `ISIC_FEED_PERMISSION_CONFIRMED` / `ISIC_FEED_URL` | server | ne | rezervovaný autorizovaný feed; bez písemného oprávnění zůstává vynuceně vypnutý |
| `OCR_ENDPOINT_URL` / `OCR_API_KEY` | pouze server | ne | volitelné HTTPS OCR API pro skenované PDF; výsledek vždy čeká na schválení |
| `DEMO_MODE` | server | ne | výhradně lokální testovací přihlášení |
| `ALLOW_LOCAL_FILE_STORE` | server | ne | lokální souborové úložiště; vyžaduje současně `DEMO_MODE=true` |
| `ALLOW_VERIFIED_FALLBACK` | server | ne | kurátorovaný fallback bez DB; v produkci ponechat `false` |
| `ADMIN_DEMO_PASSWORD` | server | ne | pouze lokální test, min. 12 znaků |
| `ADMIN_COOKIE_SECRET` | server | ne | pouze lokální test, min. 32 náhodných znaků |

## Supabase od nuly

1. Vytvořte nový Supabase projekt v evropském regionu.
2. Nainstalujte CLI: `pnpm add -D supabase` nebo použijte `pnpm dlx supabase`.
3. Přihlaste se a propojte projekt:

```powershell
pnpm dlx supabase login
pnpm dlx supabase link --project-ref VAS_PROJECT_REF
pnpm dlx supabase db push --dry-run
pnpm dlx supabase db push
```

4. Obsah `supabase/seed.sql` po obsahové kontrole spusťte jednorázově v Supabase SQL Editoru a ověřte počty i označení importovaných záznamů. V produkci nepoužívejte `db push --include-seed`; tato volba patří jen do čerstvého vývojového nebo stagingového prostředí.

5. Z Project Settings → API zkopírujte URL, anon key a service role key do `.env.local`/Vercelu. Service role klíč nesmí mít prefix `NEXT_PUBLIC_` a nesmí být commitnutý.
6. V Authentication → URL Configuration nastavte produkční Site URL a povolte přesný redirect `https://VAŠE-DOMÉNA/auth/callback`. Stejný callback dokončuje magic link, pozvánku i obnovu; administrátor pak nastaví heslo na `/admin/obnova`. Pro veřejné přihlášení nastavte vlastní SMTP, rate limity a šablony e-mailů.

Migrace jsou pořadové a nedestruktivní:

- `202608010001_initial_schema.sql` – obsah, formuláře, základní RLS;
- `202608010002_multi_university.sql` – univerzity, fakulty, role, referral a statistiky;
- `202608010003_production_sources.sql` – produkční zdroje, verzování, review queue, link checks, přísnější RLS a archivace dřívějších testovacích řádků.
- `202608020004_multi_city_foundation.sql` – města, vazby univerzit, historický základ kampusů, městský scope obsahu a statistik, nové role, RLS, indexy a publikační outbox bez PII. Migrace nejdřív vloží Brno, potom backfilluje existující řádky a až následně zpřísní omezení.
- `202608020005_refresh_vut_source_urls.sql` – idempotentní oprava přesunutých oficiálních zdrojů FAST a FA VUT bez změny publikovaných událostí.
- `202608020006_faculty_calendars.sql` – oficiální metadata všech 27 fakult, původní rozšířený scope, vazební trigger, metadata zdrojů, normalizované hashe, PDF snapshoty, review text a audit změn.
- `202608020007_source_monitoring_modes.sql` – oddělené režimy `automatic_publish/automatic_review/not_found_monitored`, monitoring všech 27 fakult, stabilní MUNI/JAMU/VETUNI zdroje, opravená RLS oprávnění a stav kontroly odkazů.
- `202608020008_source_validation_and_editor_scope.sql` – ukládání finální URL/MIME/blokace, rozšířená validace odkazů a bezpečný městský rozsah pro univerzitní termíny bez `city_id`.
- `202608040009_community_help_and_privacy.sql` – bezpečný archiv a vypnutí kampusového modelu, čísla PDF stran, veřejná pomoc, parťáci a kapacitní trigger, hlášení, superadmin RLS a analytika zapisovatelná pouze serverem po souhlasu.
- `202608060010_content_operations.sql` – přesné plánování přes `next_check_at`, atomické claimy, retry a upozornění zdrojů, konflikty termínů, okamžité publikování parťáků, deduplikace hlášení a soukromý kontaktní inbox.
- `202608060011_verified_brno_places.sql` – doplnění ověřeného katalogu na 30 skutečných brněnských míst s oficiálními zdroji, souřadnicemi a absolutním časem ověření.
- `202608110012_supabase_hourly_scheduler.sql` – hodinový dispatcher zdrojů přes Supabase Cron/pg_net; autorizační tajemství čte za běhu z Vaultu a nikdy je neobsahuje v SQL ani repozitáři.
- `202608110013_autonomous_faculty_calendars.sql` – autonomní dohledání aktuálních plánů FEKT/FCH/FP přes úřední desku VUT, devítihodinový interval všech kalendářů, aktuální FRRMS zdroj a bezpečný reset hashů změněných konektorů.
- `202608110014_twenty_minute_calendar_dispatcher.sql` – malá dávka splatných zdrojů každých 20 minut; jednotlivé zdroje nadále respektují devítihodinový interval a nové VUT konektory dostanou prioritu v prvním běhu.
- `202608120015_academic_event_schedule_uniqueness.sql` – rozlišuje legitimní opakované termíny stejného typu podle skutečného začátku a konce, při zachování sémantického otisku pro porovnání změn mezi zdroji.
- `202608120016_reprocess_vut_html_schedules.sql` – bezpečně vynutí jednorázové znovunačtení FIT/FSI po opravě strukturovaného parseru; stávající události před úspěšným během nemaže.
- `202608140017_academic_event_study_years.sql` – přidává ověřený rozsah ročníků 1–6 k akademickým událostem; `NULL` znamená společný termín pro všechny ročníky.
- `202608140018_fajn_job_feed.sql` – připravuje idempotentní import smluvních brigád, strukturovanou odměnu, bezpečné externí ID a soukromé provozní statistiky bez zpřístupnění feed URL.
- `202608160019_community_events.sql` – veřejné komunitní akce, neveřejný hash správcovského odkazu a kontakt pořadatele, RLS, automatické skrytí po třech nezávislých hlášeních a archivace ukončených akcí.
- `202608170020_event_relevance_places_buddy.sql` – přesnější akademická relevance, rozšířená metadata míst a bezpečnější vazby sekce Hledám parťáka.
- `202608170021_student_community.sql` – ověřené účty komunitního feedu, příspěvky, komentáře, reakce, hlášení, audit moderace, RLS a privátní úložiště obrázků.
- `202608220022_content_focus_update.sql` – 16 ověřených veřejných akcí, 7 dalších oficiálních míst, původ a zdravotní stav zdrojů komunitních akcí, deduplikace a bezpečná fronta ruční kontroly.

## První hlavní superadmin

Nezadávejte heslo ani service-role key do kódu, argumentu příkazu nebo dokumentace. Po aplikaci všech migrací nastavte údaje pouze v lokálním shellu a spusťte jednorázovou pozvánku:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL="https://VAS_PROJEKT.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="..."
$env:SUPERADMIN_EMAIL="vas-skutecny-email@example.cz"
pnpm admin:invite
```

Skript odmítne vytvořit dalšího hlavního superadmina, nastaví shodnou roli `super_admin` v profilu i App metadata a odešle oficiální Supabase pozvánku. Heslo nevytváří ani nezobrazuje. Po dokončení se aktualizuje ignorovaný lokální soubor `ADMIN-PRISTUP-LOKALNE.txt`; `git check-ignore ADMIN-PRISTUP-LOKALNE.txt` musí soubor najít. Obnova přístupu používá stejné lokální proměnné a `pnpm admin:recover`.

Audit již existujícího hlavního účtu spustíte příkazem `pnpm admin:audit`. Kontroluje právě jeden potvrzený účet `super_admin` a shodu Auth App metadata s tabulkou `profiles`; nevypisuje e-mail ani žádný klíč.

Další role (`admin`, `city_editor`, `faculty_editor`) spravuje přihlášený superadmin v Administrace → Správci. Server kontroluje App metadata při přihlášení a RLS profil v databázi; obě vrstvy musí souhlasit.

Administrace je na `/admin`. Bez platné serverově ověřené session přesměruje na `/admin/prihlaseni`.

## Datové zdroje a synchronizace

Kompletní tabulka všech fakult, URL, formátu a režimu je v [docs/data-sources.md](docs/data-sources.md).

V současném registru se 18 fakultních zdrojů může publikovat automaticky a 9 se monitoruje v kontrolovaném režimu. Všech 27 fakult má dohledaný aktivní oficiální zdroj; žádný není ve stavu `not_found_monitored`. Hodnota `enabled=false` znamená výslovné administrátorské vypnutí monitoringu, nikoli požadavek na ruční schválení.

`pnpm test` spouští kromě unit testů také izolovanou PostgreSQL integraci přes PGlite: kontroluje všech 22 migrací, aplikuje 20 datových migrací a seed, zpracuje HTML/PDF fixtures, vytvoří veřejné události i review frontu a ověří RLS rolí `anon`, běžný uživatel, `faculty_editor`, `city_editor` a `super_admin`, zákaz přímého analytického zápisu, kapacitu parťáků, soukromý kontaktní inbox, vytvoření/úpravu/soft delete komunitního příspěvku, komentáře, unikátní reakce, nejužitečnější odpověď, automatické skrytí po třech hlášeních, 16 ověřených veřejných akcí a přesně 36 ověřených míst. Infrastrukturní migrace `202608110012` a `202608110014` pro `pg_cron`/`pg_net` mají samostatné regresní testy a ověřují se nad propojeným Supabase, protože PGlite tato hostovaná rozšíření neposkytuje.

Preference ročníku je anonymní a zůstává pouze v prohlížeči. Akademický cyklus se v časové zóně Praha překlápí 1. července; uložený ročník se zvýší nejvýše jednou za každý uplynulý cyklus. Po překročení šestého ročníku se volba bezpečně zruší a aplikace požádá o nový výběr. Ruční změna založí nový referenční cyklus. Událost se na ročník váže jen při jednoznačném údaji v oficiálním zdrojovém textu; společné nebo nejisté termíny zůstávají bez omezení.

Konektor Fajn‑brigády je v čisté instalaci i produkčním vzoru vypnutý. Neprovádí scraping webu a neukládá kontakty z popisu. Po získání písemného oprávnění nastavte všech pět `FAJN_BRIGADY_*` proměnných pouze na serveru. Parser přijímá omezené XML bez DTD/entit, detailní odkazy pouze na ověřených doménách a mapuje odměnu podle oficiálních číselníků. Import je idempotentní podle `(provider_key, external_id)`; výchozí inkrementální režim při chybějící položce nic nemaže. URL feedu se nezobrazuje ve veřejném ani administrátorském API a testovací XML se konfigurací nedá aktivovat.

## Komunitní kalendář „Co se děje“

Veřejný přepínač na `/{mesto}/kalendar?view=community` odděluje neověřené komunitní akce od oficiálně zdrojovaných školních termínů. Akce se přidává bez účtu a publikuje ihned; server kontroluje budoucí termín, maximální délku, HTTPS odkazy, duplicity, honeypot a denní limit. Obrázek je volitelný, dekóduje se a znovu ukládá jako WebP v bucketu `community-event-images`. E-mail pořadatele a hash správcovského tokenu nejsou veřejné. Pokud je nastavený `RESEND_API_KEY`, autor dostane neveřejný odkaz e-mailem; jinak jej musí uložit z potvrzovací obrazovky. Tři nezávislá hlášení akci automaticky skryjí a cron ukončené akce archivuje.

Události označené „Veřejný zdroj“ pocházejí z oficiálních veřejných kalendářů pořadatelů. Každý zdroj se kontroluje nejvýše přibližně jednou za devět hodin; selhání jednoho odkazu nezastaví ostatní. Neočekávaný MIME typ, PDF nebo změněný či nejednoznačný obsah se nikdy automaticky nepřepíše a přejde do stavu `needs_review`. Záznam může být archivován až po dvou úspěšných HTML kontrolách, které jednoznačně potvrdí jeho odstranění ze zdroje.

Novým uživatelům se po cookies a úvodním výběru zobrazí plný návod. Existujícím uživatelům se pro verzi `studenthub-focus-v3` zobrazí jednorázové stručné vysvětlení rozdělení „Co se děje“, „Hledám parťáka“ a „Studentská komunita“; návod má jedinou akci „Rozumím“ a z menu jej lze kdykoli otevřít znovu.

Automatický tok:

1. plánovač každých 20 minut ověří `Authorization: Bearer $CRON_SECRET` (nebo serverové tajemství Supabase Scheduleru) a atomicky si vyzvedne jen malou dávku zdrojů, jejichž `next_check_at` už nastal; každý úspěšný běh naplánuje další kontrolu daného zdroje za 9 hodin;
2. zdroj se atomicky zamkne, načte s timeoutem, limitem 5 MB, maximálně třemi redirecty a podmíněnými hlavičkami ETag/Last-Modified;
3. URL i každý redirect projdou HTTPS allowlistem, DNS kontrolou a blokací privátních/metadata adres; crawler respektuje `robots.txt` a při jeho dočasné nedostupnosti cílový dokument preventivně nestahuje;
4. odpověď se hashne a nezměněný obsah se znovu neparsuje, ale u již publikovaných událostí se bezpečně obnoví čas posledního ověření;
5. uloží se bezpečný snapshot; u ročních rozcestníků se omezeně projde stránkování a nejvýše dvě úrovně `seznam → detail → příloha`; HTML/ICS/JSON nebo PDF.js parser normalizuje `Europe/Prague`, celodenní/časované termíny, školu, fakultu, program, akademický rok a číslo PDF stránky;
6. jistota ≥ 0,90 může být publikována pouze u zdroje v `automatic_publish`; aktuální oficiální PDF s textovou vrstvou a jednoznačným akademickým rokem může projít samo, zatímco OCR, starý rok, konflikt, nejasný dokument a zdroj blokovaný `robots.txt` vždy čekají v administraci;
7. chybějící budoucí záznam se archivuje pouze po úspěšném kompletním načtení; ruční override se nepřepisuje;
8. po třech chybách je zdroj označen `stale`, nikoli automaticky smazán.

Ruční synchronizace je v Administrace → Datové zdroje. Cron endpointy:

```text
GET /api/cron/sync-sources?city=brno
GET /api/cron/check-links
Authorization: Bearer <CRON_SECRET>
```

Supabase Cron kontroluje splatné zdroje v minutách 17, 37 a 57; databázové `next_check_at` brání tomu, aby byl stejný zdroj stahován častěji než jednou za 9 hodin. Autorizační hodnota `SUPABASE_SCHEDULER_SECRET` musí být shodná ve Vercelu a v Supabase Vault pod názvem `studenthub_scheduler_secret`. Vercel Hobby navíc spouští povolenou denní zálohu ve 03:17 UTC a kontrolu odkazů v 04:45 UTC; Vercel předává `CRON_SECRET` jako Bearer automaticky. Tajemství nikdy nevkládejte přímo do migrace ani do příkazu v dokumentaci.

## Jak přidat nové město

Nová edice nevzniká kopií projektu. Používá stejný kód, dynamické routy `app/[city]`, společné tabulky a městský scope. Postupujte v tomto pořadí:

1. Jako `super_admin` vložte do `cities` město ve stavu `draft`, s `enabled=false`, správným časovým pásmem, středem, zoomem a hranicemi mapy. Nevkládejte město jen kvůli ukázce.
2. Propojte skutečně působící školy přes `university_cities`; jedna univerzita může mít více měst. Kampusy nejsou součástí aktivního profilu ani filtrování.
3. Založte městské/referral komunity a přiřaďte `city_id`. Vytvořte editora s `role='city_editor'` a stejným `city_id` v profilu i App metadata.
4. Přidejte ověřené veřejné zdroje. Lokální zdroj musí mít `city_id`; centrální akademický zdroj může zůstat bez města. Nikdy nepřidávejte neveřejný školní systém ani školní heslo.
5. Spusťte ruční sync pouze pro nové město (`/api/cron/sync-sources?city=<slug>`), projděte review queue, zdroje bez výsledku a data posledního ověření. Neaktivní město se nesmí synchronizací publikovat.
6. Nahrajte reálná místa s `city_id`, volitelnou školou/fakultou a souřadnicemi, nabídky přes `offer_cities`, lokální brigády s `city_id`; vzdálená brigáda může být `remote` bez města. Nepoužívejte falešná produkční data.
7. Doplňte `brand_config`, kontakty a povolené assety edice. Neměňte společnou značku a nepoužívejte univerzitní loga bez svolení. Generátor manifestu je v `lib/pwa-manifest.ts`.
8. V administraci zkontrolujte readiness: souřadnice a hranice, počty obsahu, chybějící zdroje, právní texty, odpovědnou osobu a RLS test městského editora.
9. Spusťte `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` a `pnpm test:e2e`; testovací druhé město smí existovat pouze ve fixture/testu. Ověřte 390×844, 768×1024 a 1440×900, canonical, OG, sitemap a 404 neaktivní edice.
10. Teprve poté nastavte `public_status='published'`, `enabled=true`, přidejte slug do `PUBLISHED_CITY_SLUGS` a zapněte `MULTI_CITY_ENABLED=true` i `NEXT_PUBLIC_MULTI_CITY_ENABLED=true`. Ověřte, že selektor se ukáže až při nejméně dvou publikovaných městech a sitemap neobsahuje drafty.

## Příprava pro budoucí publikační automatizaci

Tabulka `content_publication_events` je bezpečný outbox událostí `published`, `updated`, `expiring` a `archived`. Obsahuje jen reference, scope, čas, ověřenost a veřejný zdroj; žádný e-mail, telefon, poptávku ani volný formulářový obsah. Interní read-only funkce `getPromotionCandidates()` v `lib/publication-feed.ts` vrací pro jedno publikované město pouze aktuální, ověřené, nevypršené záznamy. Aplikace neobsahuje AI token, volání modelu, generátor marketingových textů ani automatické publikování na sociální sítě.

## Testy a kontrola kvality

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm check:links
pnpm check:pwa
```

Unit testy navíc pokrývají validaci vazby školy a fakulty, migraci a perzistenci preferencí včetně přechodu ročníku 30. června / 1. července, sjednocení univerzitních/fakultních termínů bez průniku jiné fakulty, přesné filtrování ročníku, bezpečný XML parser a idempotenci brigád, textové/tabulkové/skenované PDF, změnu hashe na stejné URL, přesun a zrušení termínu, databázové scope/RLS, více měst, shodu brand assetů a outbox bez PII. Playwright prochází jednu fakultu každé z pěti škol na desktopu 1440×900, tabletu 768×1024 a mobilu 390×844, URL filtry, světlý/tmavý motiv, navigaci a horizontální overflow.

Regresní sada dále ověřuje číslo stránky PDF, honeypot, bezpečné vlastní úpravy veřejné pomoci, budoucí termín a kapacitní limit parťáků, zákaz přímého zápisu analytiky přes anon klíč, odstranění query/full-referrer dat a sekvenční modalitu cookies/onboardingu. PWA scénáře kontrolují manifest, všechny čtyři ikony, `beforeinstallprompt`, iOS návod, již nainstalovaný režim, jediný přístupný dialog, mapu bez overflow, service-worker cache bez dynamického HTML a skutečnou offline navigaci.

`pnpm check:pwa` provede statickou kontrolu. Pro kontrolu běžícího webu předejte URL:

```powershell
pnpm check:pwa https://studenthub-brno.vercel.app
```

`pnpm check:links` používá bezpečný GET s limitem velikosti, respektuje `robots.txt` a u ročních rozcestníků prochází stránkování i cestu seznam → detail → finální PDF. Kontroluje finální URL, skutečný MIME typ, akademický rok, PDF hlavičku a očekávanou strukturu obsahu. Sdílené IS stránky načítá jednou s omezeným backoff retry a při dočasné nedostupnosti nic nemění. Produkční cron uchovává historii a za definitivně rozbitý označí odkaz až po třech selháních.

## Nasazení na Vercel

1. Nahrajte repozitář na GitHub/GitLab/Bitbucket.
2. Ve Vercelu zvolte New Project, framework Next.js a ponechte build `pnpm build`.
3. Nastavte všechny produkční proměnné z tabulky; zejména:

```dotenv
APP_ENV=production
DEMO_MODE=false
ALLOW_LOCAL_FILE_STORE=false
ALLOW_VERIFIED_FALLBACK=false
NEXT_PUBLIC_ADS_ENABLED=false
NEXT_PUBLIC_OFFERS_ENABLED=false
FAJN_BRIGADY_FEED_ENABLED=false
FAJN_BRIGADY_PERMISSION_CONFIRMED=false
FAJN_BRIGADY_FEED_URL=
FAJN_BRIGADY_SYNC_INTERVAL_HOURS=9
FAJN_BRIGADY_FEED_MODE=incremental
ISIC_FEED_ENABLED=false
ISIC_FEED_PERMISSION_CONFIRMED=false
DEFAULT_CITY_SLUG=brno
NEXT_PUBLIC_DEFAULT_CITY_SLUG=brno
MULTI_CITY_ENABLED=false
NEXT_PUBLIC_MULTI_CITY_ENABLED=false
PUBLISHED_CITY_SLUGS=brno
```

4. Vygenerujte tajemství například `openssl rand -base64 48` pro `CRON_SECRET` a `RATE_LIMIT_SALT`.
5. Deployněte a ověřte `/`, `/admin`, `/api/cron/sync-sources` (bez tokenu musí vrátit 401), Supabase logy a `pnpm check:pwa https://studenthub-brno.vercel.app`.

CLI varianta:

```powershell
pnpm dlx vercel login
pnpm dlx vercel link
pnpm dlx vercel env add NEXT_PUBLIC_SITE_URL production
pnpm dlx vercel env add NEXT_PUBLIC_SUPABASE_URL production
pnpm dlx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
pnpm dlx vercel env add SUPABASE_SERVICE_ROLE_KEY production
pnpm dlx vercel env add CRON_SECRET production
pnpm dlx vercel env add ADMIN_COOKIE_SECRET production
pnpm dlx vercel env add RATE_LIMIT_SALT production
pnpm dlx vercel env add APP_ENV production
pnpm dlx vercel --prod
```

## Vlastní doména

Vercel → Project → Settings → Domains → Add. Přidejte apex i `www`, nastavte doporučené DNS záznamy, zvolte primární variantu a aktualizujte `NEXT_PUBLIC_SITE_URL`. Po změně spusťte nový deployment a zkontrolujte canonical URL, sitemap, PWA manifest, e-mailové adresy a HTTPS redirect.

## Právní a obsahová pravidla

Právní stránky jsou označené jako pracovní návrh a před ostrým spuštěním je musí zkontrolovat právník. Analytika a marketing jsou opt-in. Bez souhlasu se nespouští žádný externí analytický ani reklamní skript. Affiliate odkazy používají `rel="sponsored nofollow"`; běžné ověřené odkazy ne.

Akademické údaje pocházejí pouze z veřejných zdrojů. Aplikace nevyžaduje školní heslo, nescrapuje neveřejné IS a nesnaží se je nahradit. Univerzitní loga nejsou použita; samostatná značka používá stylizovanou siluetu Brna s bezpečnými okraji pro faviconu a PWA.

## Checklist před ostrým spuštěním

- [ ] právník zkontroloval soukromí, cookies a obchodní podmínky;
- [ ] skutečné kontaktní e-maily přijímají poštu a mají správce;
- [ ] migrace a seed proběhly na produkčním Supabase bez chyb;
- [ ] první hlavní `super_admin` vznikl přes `pnpm admin:invite`; pozvánka, magic link, obnova a odhlášení fungují se skutečným SMTP;
- [ ] případní `admin`, `city_editor`/`faculty_editor` mají shodný profil i App metadata a otestovaný rozsah;
- [ ] service role, cron a rate-limit tajemství jsou pouze ve Vercelu a byla rotována;
- [ ] tři produkční testovací přepínače jsou `false`;
- [ ] všechny automatické zdroje prošly prvním během a ruční zdroje mají vlastníka;
- [ ] nabídky/brigády jsou podložené souhlasem partnera nebo smluvním feedem;
- [ ] feed flagy i `*_PERMISSION_CONFIRMED` zůstávají `false`, dokud není písemný souhlas a dokumentovaný smluvní feed;
- [ ] reklamní pozice zůstává vypnutá, dokud není implementováno consent-aware načtení konkrétní sítě;
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` jsou zelené;
- [ ] vizuální kontrola proběhla na 390×844, 768×1024 a 1440×900;
- [ ] vlastní doména, HTTPS, canonical, sitemap, robots a PWA instalace fungují;
- [ ] Supabase/Vercel mají monitoring chyb, rozpočtové limity a zálohy.

## Struktura

- `app/` – App Router stránky, metadata a serverové API;
- `components/` – dashboard, filtry, mapa, formuláře, onboarding, consent, PWA instalace a administrace;
- `lib/brand.ts`, `lib/cities.ts`, `lib/city-data.ts`, `lib/academic-catalog.ts` – centrální značka, fallback Brna, databázový katalog škol/fakult a serverový seznam pouze publikovaných edic;
- `lib/publication-feed.ts` – interní read-only výstup ověřeného veřejného obsahu bez PII;
- `lib/sources/` a `lib/job-feed/` – registr, SSRF-safe fetch, akademické parsery a oddělený bezpečný smluvní import brigád;
- `lib/external-content-providers.ts` – ve výchozím stavu vypnutá rozhraní budoucích smluvních feedů bez scrapování;
- `lib/anonymous-owner.ts`, `lib/user-auth.ts`, `lib/buddy.ts` – vlastnický token žádostí, ověřené Supabase účty a expirace parťáků;
- `scripts/invite-superadmin.mjs` – jednorázová bezpečná pozvánka a obnova hlavního správce bez hesla v kódu;
- `lib/verified-data.ts` – kurátorovaný fallback ověřených veřejných záznamů;
- `supabase/migrations/` a `supabase/seed.sql` – schéma, RLS a produkční startovní data;
- `scripts/check-pwa.mjs` – kontrola manifestu, rozměrů ikon, bezpečného workeru a živé HTTPS instalovatelnosti;
- `tests/fixtures`, `tests/unit`, `tests/e2e` – fixture, unit a Playwright testy;
- `vercel.json` – region, crony a cache pravidlo service workeru.

Logo assety `public/icon-192.png`, `public/icon-512.png` a `public/og.png` jsou zachované beze změny. Bitově shodné kopie pro konfigurovatelnou edici jsou v `public/brand/brno/`; maskable varianty mají bezpečný ořez a zachovávají proporce stejného brněnského symbolu. Žádné univerzitní ani fiktivní celostátní logo nebylo vytvořeno.
## Studentská komunita

`/komunita` používá stávající Supabase magic-link účet. Veřejné API vrací pouze přezdívku a obsah; e-mail ani interní `author_id` neposílá. Příspěvky a komentáře se po ověření e-mailu publikují ihned, autor je může upravit a odstranit pomocí soft delete. Reakce a hlášení jsou unikátní pro uživatele a cíl. Výchozí limit tří nezávislých hlášení lze změnit v `/admin?section=community_forum`; automatické i ruční zásahy se zapisují do auditní historie. Obrázky se načtou jen jako JPEG/PNG/WebP do 5 MB, skutečně dekódují a znovu uloží jako WebP bez původních metadat.
