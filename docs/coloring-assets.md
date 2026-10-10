# Omalovánky StudentHub – interní záznam

Vytvořeno 10. 10. 2026 nástrojem imagegen, jednorázově během vývoje.
Neexistují runtime AI požadavky ani nové placené backendové služby.

Společný prompt: „Portrait 3:4, original adult student coloring page, white
background, thick clean black line art only, no grey/color/text/logos/watermarks,
closed generous finger-coloring spaces, coherent architecture, no living artist
style or licensed characters.“ Každý motiv vznikl samostatně:

| Asset | Motiv doplněný do promptu |
|---|---|
| botanical | Large flowers and leaves, abstract harmonious botanical pattern |
| desk | Cozy student desk, laptop, books, plant, headphones, window, no people |
| library | Quiet university library, shelves, books, window, reading armchair, leafy plant |
| cafe | Cozy students cafe, tables, cups, chairs, plants, counter, coffee machine |
| brno | Twin cathedral spires, hillside townhouses, cafe seating, park |
| praha | Stone bridge, river, gothic bridge tower, townhouses, riverbank park |
| olomouc | Town hall clock tower, ornamental fountain, arcaded houses, tree, bench |
| ostrava | Mining tower, rounded gas holder arts building, university building, park |

Technická příprava: `node scripts/prepare-coloring-assets.mjs <id> <source.png>`.
Výstup je `public/coloring/v1/<id>/`: průhledné linky, RGB indexovaná maska,
JSON velikostí a bezpečných bodů oblastí, náhled WebP 256 px. Malé izolované
oblasti pod 180 px nejsou klikací. Jednopixelové mezery uzavírá morfologický
filtr. Masky se připravují offline, nikoliv při každém klepnutí. Každý vzor má
768 × 1024 px. Není nutné přenášet zdrojové generované PNG do produkce.

## Navigace a aktivity

`/<city>/odpocinek` je výběr aktivních aktivit z typového registru
`lib/rest-activities.ts`. Galerie je `/<city>/odpocinek/omalovanky`, editor
`/<city>/odpocinek/omalovanky/<slug>`. Staré editorové odkazy mají 308 redirect.
Profil odkazuje přímo do galerie. Nová aktivita potřebuje vlastní stránku
a aktivní položku registru; žádná další databázová tabulka není potřeba.
Zoom a pozice se ukládají jen do sessionStorage, odděleně podle vlastníka
a motivu, společně napříč městy. Procento vychází z vyplněných oblastí;
tahy štětce nejsou odhadem vyplněné plochy. Dokončení lze označit ručně.

## Ukládání

Lokální rozehrání: localStorage, assety: IndexedDB a verzovaná PWA cache.
To není záloha. Cloud: `coloring_progress`, klíč účet + motiv (nikoliv město).
RLS dovoluje pouze vlastní čtení; zápis jde přes validovaný transakční RPC.
Revize řeší souběžné změny, konflikt vyžaduje výslovnou volbu uživatele.
API i RPC omezují počet zápisů; nejvýše 300 tahů / 16000 bodů / 600 kB.
Undo/redo uchovává nejvýše 30 kroků. Export PNG probíhá pouze na zařízení.

Migrace: `202610100001_private_coloring_progress.sql`.
Navazující oprava: `202610100002_coloring_conflict_no_retry.sql`.
Aplikační konflikt používá `P0001`, nikoliv `40001` (ten může PostgREST
opakovat bez konce). API jej převádí na HTTP 409 a vyžádá volbu uživatele.
Před nasazením `pnpm exec supabase db push --linked` po ověření seznamu migrací.
Výpadek cloudového ukládání nemění ostatní funkce aplikace.
