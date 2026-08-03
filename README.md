# StudentHub Brno

Nezávislá PWA pro studenty všech brněnských vysokých škol, připravená k produkčnímu nasazení po dokončení checklistu v tomto dokumentu. Spojuje ověřené veřejné akademické termíny, užitečná místa, nabídky, brigády a neveřejné poptávky technické pomoci. Není oficiální službou žádné univerzity a nepřihlašuje se do školních informačních systémů.

## Co aplikace obsahuje

- personalizovaný dashboard bez registrace pro MUNI, VUT, MENDELU, VETUNI a JAMU;
- 27 fakult a městské routy `/brno`, `/brno/kalendar`, `/brno/mista`, `/brno/nabidky`, `/brno/brigady` a `/brno/skoly/<škola>`; původní URL bezpečně přesměrovávají;
- fakultní kalendář s validovanými URL parametry (`?university=muni&faculty=muni-fi`), sjednocením univerzitních a fakultních termínů, odkazem na zdroj, sdílením, Google Calendar a korektním `.ics` exportem;
- reaktivní výběr školy/fakulty bez registrace a aktuální studijní kontext pod značkou v desktopové i mobilní navigaci;
- Leaflet/OpenStreetMap mapu i plně použitelný seznam ověřených míst;
- nabídky a brigády s moderací, expirací a označením sponzorství/affiliate;
- bezpečně uložené poptávky technické pomoci a návrhy studentských spolků;
- administraci pro role `super_admin`, brněnský `admin`, městsky omezený `city_editor` a fakultně omezený `faculty_editor`;
- registr zdrojů, synchronizační historii, snapshoty, frontu nejistých změn a kontrolu odkazů;
- opt-in cookie consent, tři režimy motivu, PWA/offline obrazovku, SEO a bezpečnostní hlavičky.

Veřejné UI nikdy nepoužívá falešné partnery, brigády ani „výplňové“ akademické termíny. Nabídky a brigády jsou po čisté instalaci prázdné. Ověřený seed obsahuje jen ručně ověřené veřejné termíny a reálná místa s odkazy na zdroje.

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
| `CRON_SECRET` | pouze server | ano | Bearer autorizace obou cron endpointů |
| `RATE_LIMIT_SALT` | pouze server | ano | pseudonymizace IP pro lokální rate limit |
| `SYNC_USER_AGENT` | server | ano | identifikace slušného crawleru s kontaktem |
| `NEXT_PUBLIC_ADS_ENABLED` | klient/build | ne | `true` pouze po obchodním a cookie nastavení |
| `NEXT_PUBLIC_CONTACT_EMAIL` | build | doporučeno | veřejný kontakt |
| `NEXT_PUBLIC_PARTNER_EMAIL` | build | doporučeno | kontakt pro partnery |
| `FAJN_BRIGADY_FEED_ENABLED` | server | ne | rezervovaný, výchozí `false`; bez smluvního feedu se nepoužije |
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

Migrace jsou pořadové a nedestruktivní:

- `202608010001_initial_schema.sql` – obsah, formuláře, základní RLS;
- `202608010002_multi_university.sql` – univerzity, fakulty, role, referral a statistiky;
- `202608010003_production_sources.sql` – produkční zdroje, verzování, review queue, link checks, přísnější RLS a archivace dřívějších testovacích řádků.
- `202608020004_multi_city_foundation.sql` – města, vazby univerzit, kampusy, městský scope obsahu a statistik, nové role, RLS, indexy a publikační outbox bez PII. Migrace nejdřív vloží Brno, potom backfilluje existující řádky a až následně zpřísní omezení.
- `202608020005_refresh_vut_source_urls.sql` – idempotentní oprava přesunutých oficiálních zdrojů FAST a FA VUT bez změny publikovaných událostí.
- `202608020006_faculty_calendars.sql` – oficiální metadata všech 27 fakult, scope `city/university/faculty/programme/campus`, vazební trigger, metadata zdrojů, normalizované hashe, PDF snapshoty, review text a audit změn.
- `202608020007_source_monitoring_modes.sql` – oddělené režimy `automatic_publish/automatic_review/not_found_monitored`, monitoring všech 27 fakult, stabilní MUNI/JAMU/VETUNI zdroje, opravená RLS oprávnění a stav kontroly odkazů.
- `202608020008_source_validation_and_editor_scope.sql` – ukládání finální URL/MIME/blokace, rozšířená validace odkazů a bezpečný městský rozsah pro univerzitní termíny bez `city_id`.

## První administrátor

1. V Supabase Authentication → Users vytvořte uživatele s ověřeným e-mailem.
2. V SQL Editoru nastavte profil:

```sql
update public.profiles set role = 'admin', city_id = 'brno' where id = 'UUID_UZIVATELE';
```

3. V Authentication → Users → uživatel → App metadata nastavte:

```json
{ "role": "admin", "city_id": "brno" }
```

Pro fakultního editora nastavte profil `role='faculty_editor'`, `faculty_id='vut-fit'` (nebo jinou fakultu). Pro městského editora nastavte `role='city_editor'`, `city_id='brno'`. `super_admin` je jediná globální role a používejte ji jen pro zakládání a publikování nových měst. Stejné hodnoty uložte do App metadata. Server kontroluje metadata při přihlášení; RLS kontroluje profil v databázi. Obě vrstvy musí souhlasit.

Administrace je na `/admin`. Bez platné serverově ověřené session přesměruje na `/admin/prihlaseni`.

## Datové zdroje a synchronizace

Kompletní tabulka všech fakult, URL, formátu a režimu je v [docs/data-sources.md](docs/data-sources.md).

V současném registru se 15 strukturovaných fakultních zdrojů může publikovat automaticky, 11 se automaticky stahuje s ručním schválením a FRRMS MENDELU je ve stavu `not_found_monitored`. Hodnota `enabled=false` znamená výslovné administrátorské vypnutí monitoringu, nikoli požadavek na ruční schválení.

`pnpm test` spouští kromě unit testů také izolovanou PostgreSQL integraci přes PGlite: aplikuje všech osm migrací a seed, zpracuje HTML/PDF fixtures, vytvoří veřejné události i review frontu a ověří RLS rolí `anon`, `faculty_editor`, `city_editor` a `super_admin`. Plnohodnotný Supabase Auth/REST stack je před veřejným nasazením nutné navíc ověřit proti skutečnému Supabase projektu.

Automatický tok:

1. cron ověří `Authorization: Bearer $CRON_SECRET`;
2. zdroj se atomicky zamkne, načte s timeoutem, limitem 5 MB, maximálně třemi redirecty a podmíněnými hlavičkami ETag/Last-Modified;
3. URL projde HTTPS allowlistem, DNS kontrolou a blokací privátních/metadata adres; crawler respektuje `robots.txt`;
4. odpověď se hashne a nezměněný obsah se znovu neparsuje;
5. uloží se bezpečný snapshot; HTML/ICS/JSON nebo PDF.js parser normalizuje `Europe/Prague`, celodenní/časované termíny, školu, fakultu, program/kampus a akademický rok;
6. jistota ≥ 0,90 může být publikována; PDF a nejisté změny vždy čekají v administraci;
7. chybějící budoucí záznam se archivuje pouze po úspěšném kompletním načtení; ruční override se nepřepisuje;
8. po třech chybách je zdroj označen `stale`, nikoli automaticky smazán.

Ruční synchronizace je v Administrace → Datové zdroje. Cron endpointy:

```text
GET /api/cron/sync-sources?city=brno
GET /api/cron/check-links
Authorization: Bearer <CRON_SECRET>
```

Vercel cron běží denně v 03:15 UTC a kontrola odkazů v 04:45 UTC. Vercel předává `CRON_SECRET` jako Bearer automaticky.

## Jak přidat nové město

Nová edice nevzniká kopií projektu. Používá stejný kód, dynamické routy `app/[city]`, společné tabulky a městský scope. Postupujte v tomto pořadí:

1. Jako `super_admin` vložte do `cities` město ve stavu `draft`, s `enabled=false`, správným časovým pásmem, středem, zoomem a hranicemi mapy. Nevkládejte město jen kvůli ukázce.
2. Propojte skutečně působící školy přes `university_cities`; jedna univerzita může mít více měst. Doplňte pouze ověřené kampusy do `campuses`.
3. Založte městské/referral komunity a přiřaďte `city_id`. Vytvořte editora s `role='city_editor'` a stejným `city_id` v profilu i App metadata.
4. Přidejte ověřené veřejné zdroje. Lokální zdroj musí mít `city_id`; centrální akademický zdroj může zůstat bez města. Nikdy nepřidávejte neveřejný školní systém ani školní heslo.
5. Spusťte ruční sync pouze pro nové město (`/api/cron/sync-sources?city=<slug>`), projděte review queue, zdroje bez výsledku a data posledního ověření. Neaktivní město se nesmí synchronizací publikovat.
6. Nahrajte reálná místa s `city_id`/`campus_id`, nabídky přes `offer_cities`, lokální brigády s `city_id`; vzdálená brigáda může být `remote` bez města. Nepoužívejte falešná produkční data.
7. Doplňte `brand_config`, kontakty a povolené assety edice. Neměňte společnou značku a nepoužívejte univerzitní loga bez svolení. Generátor manifestu je v `lib/pwa-manifest.ts`.
8. V administraci zkontrolujte readiness: souřadnice a hranice, kampusy, počty obsahu, chybějící zdroje, právní texty, odpovědnou osobu a RLS test městského editora.
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
```

Unit testy navíc pokrývají validaci vazby školy a fakulty, migraci a perzistenci preferencí, sjednocení univerzitních/fakultních termínů bez průniku jiné fakulty, textové/tabulkové/skenované PDF, změnu hashe na stejné URL, přesun a zrušení termínu, databázové scope/RLS, více měst, shodu brand assetů a outbox bez PII. Playwright prochází jednu fakultu každé z pěti škol na desktopu 1440×900, tabletu 768×1024 a mobilu 390×844, URL filtry, světlý/tmavý motiv, navigaci a horizontální overflow.

`pnpm check:links` používá bezpečný GET s limitem velikosti, kontroluje finální URL, MIME, akademický rok, PDF hlavičku a očekávanou strukturu obsahu. Sdílené IS stránky načítá jednou s omezeným backoff retry a při dočasné nedostupnosti nic nemění. Produkční cron uchovává historii a za definitivně rozbitý označí odkaz až po třech selháních.

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
DEFAULT_CITY_SLUG=brno
NEXT_PUBLIC_DEFAULT_CITY_SLUG=brno
MULTI_CITY_ENABLED=false
NEXT_PUBLIC_MULTI_CITY_ENABLED=false
PUBLISHED_CITY_SLUGS=brno
```

4. Vygenerujte tajemství například `openssl rand -base64 48` pro `CRON_SECRET` a `RATE_LIMIT_SALT`.
5. Deployněte a ověřte `/`, `/admin`, `/api/cron/sync-sources` (bez tokenu musí vrátit 401) a Supabase logy.

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
- [ ] první brněnský `admin`, případní `city_editor`/`faculty_editor` a nouzový `super_admin` mají shodný profil i App metadata;
- [ ] service role, cron a rate-limit tajemství jsou pouze ve Vercelu a byla rotována;
- [ ] tři produkční testovací přepínače jsou `false`;
- [ ] všechny automatické zdroje prošly prvním během a ruční zdroje mají vlastníka;
- [ ] nabídky/brigády jsou podložené souhlasem partnera nebo smluvním feedem;
- [ ] reklamní pozice zůstává vypnutá, dokud není implementováno consent-aware načtení konkrétní sítě;
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` jsou zelené;
- [ ] vizuální kontrola proběhla na 390×844, 768×1024 a 1440×900;
- [ ] vlastní doména, HTTPS, canonical, sitemap, robots a PWA instalace fungují;
- [ ] Supabase/Vercel mají monitoring chyb, rozpočtové limity a zálohy.

## Struktura

- `app/` – App Router stránky, metadata a serverové API;
- `components/` – dashboard, filtry, mapa, formuláře, onboarding, consent a administrace;
- `lib/brand.ts`, `lib/cities.ts`, `lib/city-data.ts`, `lib/academic-catalog.ts` – centrální značka, fallback Brna, databázový katalog škol/fakult a serverový seznam pouze publikovaných edic;
- `lib/publication-feed.ts` – interní read-only výstup ověřeného veřejného obsahu bez PII;
- `lib/sources/` – registr, SSRF-safe fetch, parsery, normalizace, reconciliace a sync;
- `lib/verified-data.ts` – kurátorovaný fallback ověřených veřejných záznamů;
- `supabase/migrations/` a `supabase/seed.sql` – schéma, RLS a produkční startovní data;
- `tests/fixtures`, `tests/unit`, `tests/e2e` – fixture, unit a Playwright testy;
- `vercel.json` – region, crony a cache pravidlo service workeru.

Logo assety `public/icon-192.png`, `public/icon-512.png` a `public/og.png` jsou zachované beze změny. Bitově shodné kopie pro konfigurovatelnou edici jsou v `public/brand/brno/`; žádné univerzitní ani fiktivní celostátní logo nebylo vytvořeno.
