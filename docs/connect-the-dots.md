# Spojování bodů

Aktivita je dočasně skrytá (`dots.enabled: false` v `lib/rest-activities.ts`).
Nezobrazuje se ve výběru ani profilu, není v sitemapě a její stránky i API
vracejí 404. Kód, databáze a uložený postup zůstávají zachované. Zapnutí
registru znovu zpřístupní aktivitu i její zachované herní E2E scénáře.

Odpočinek používá jediný registr `lib/rest-activities.ts`. Galerie a hry jsou
pod `/<city>/odpocinek/spojovani-bodu`; město není součástí klíče postupu.

Šest manifestů v `lib/connect-dots.ts` popisuje zjednodušené, uzavřené obrysy
prvků původních omalovánek: list, notebook, okno, Petrov, mostecká věž a
olomoucká radniční věž. Náhledy a hotové linky se odkazují přímo na existující
`public/coloring/v1/` soubory. Nové kopie ani runtime AI se nepoužívají.
SVG zobrazuje normalizované souřadnice a přizpůsobuje výřez obrysu; hotová
originální kresba se odhalí pod zachovanou trasou. „Vybarvit tento obrázek“
otevře odpovídající původní editor ve stejném městě.

## Soukromý postup

Omalovánky i spojování sdílí `usePrivateActivityProgress`. Každá změna se
okamžitě ukládá na zařízení, cloudové změny se slučují po 1,2 s. Dokončení
vyvolá okamžité uložení. Návrat online a návrat okna do popředí bezpečně obnoví
synchronizaci. V konfliktu se nic automaticky nepřepisuje. Lokální anonymní
postup lze po přihlášení výslovně převzít do profilu.

Nová obecná tabulka `rest_activity_progress` zatím přijímá pouze aktivitu
`dots`. Původní tabulka omalovánek a její data zůstávají beze změny.
API pracuje s uživatelskou Supabase session, nikoliv se service-role klíčem.
RPC odvozuje vlastníka z `auth.uid()`, ověřuje aktivní profil, omezuje zápisy
napříč instancemi, serializuje změny a kontroluje očekávanou revizi. Přímé
zápisy do tabulky nejsou uživatelům povolené. RLS dovoluje pouze vlastní čtení.
JSON má maximálně 4 KiB a historii nejvýše 30 kroků každým směrem.

Při změně manifestu je nutné sladit validátor i databázovou verzi a migraci
postupu; nekompatibilní verze se nesmí interpretovat jako aktuální hra.
Soukromý profil ukazuje tři poslední rozehrané hry. Veřejný profil je nečte.

## Ověření

Unit/API testy: `tests/unit/connect-dots.test.ts`, `dots-api.test.ts`,
`dots-progress.test.ts`. Izolované databázové/RLS testy:
`tests/integration/dots.integration.test.ts` a celá migrace PostgreSQL.
Prohlížečové testy: `tests/e2e/dots.spec.ts` spolu s regresí `coloring.spec.ts`.
Screenshoty se ukládají do ignorovaného `artifacts/dots/`.

Kontrolovaný produkční test spouští
`node scripts/smoke-dots-production.mjs --confirm=studenthub-brno`.
Vyžaduje lokální serverové přihlašovací údaje, vytváří dva náhodné soukromé
testovací profily, ověřuje skutečnou databázi a odstraní je i jejich postup
v bloku `finally`. Neposílá e-maily ani zprávy skutečným uživatelům.
Klíče, hesla, relace a identifikátory testovacích účtů nevypisuje.

Fyzické chování konkrétního stylusu a odmítání dlaně je nutné ověřit na
skutečném tabletu; prohlížečová emulace toto nemůže plně potvrdit.
