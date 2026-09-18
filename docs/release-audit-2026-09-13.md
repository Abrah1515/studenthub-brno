# StudentHub – audit před uzavřenou testovací skupinou

Stav: audit probíhá; připravenost zatím nebyla potvrzena.

Výchozí commit: `cc06c026ac65901852a83e9b6ac0a09610f0f974`. Pracovní strom byl čistý, větev `main`, po fetch odpovídá `origin/main`.

Audit odděluje lokální testy s fixtures, PostgreSQL/RLS integraci, produkční čtení a kontrolované operace výhradně dočasných účtů. Administrativní vytvoření potvrzeného účtu není důkazem doručení e-mailu. Emulace viewportu není fyzický test iOS/Android instalace ani klávesnice.

Důkazy a strojové výsledky se ukládají do ignorované složky `artifacts/release-audit-2026-09-13/`. Obsah soukromých zpráv, uživatelské e-maily, session a klíče se do reportu neukládají.

## Výchozí nálezy

- `pnpm typecheck`: PASS.
- První `pnpm test`: 321 PASS, 1 FAIL (pětisekundový timeout textového PDF při souběžném běhu lint/typecheck/test), 3 SKIPPED. Příčina se ověřuje; nejde zatím o potvrzenou chybu parseru.

## Oblasti k ověření

Domény/routing; města/loga; navigace/témata; tutorial/cookies; registrace/session; obnova hesla; preference/profily; Přehled; kalendář; zdroje/synchronizace; Hlídač/push/ICS; místa/GPS; komunita; parťáci; chat; brigády; Burza; Bydlení; statické stránky/kontakt; role/admin; moderace; API/RLS; Storage; cron; doručování e-mailů; PWA; přístupnost; osm viewportů/prohlížeče; výkon/síť; SEO; analytika; zálohy/obnova; automatické sady; produkční opravy; úklid.
