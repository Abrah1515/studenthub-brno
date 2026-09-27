# Marketing capture pro Instagram

Interní workflow vytváří anonymní, read-only záznamy veřejných částí StudentHubu v mobilním poměru 9:16. Není součástí buildu, CI ani produkční aplikace a nepřidává veřejnou routu.

## Spuštění

```bash
npm run marketing:capture
```

Výchozí zdroj je `https://studenthubapp.cz`. Jinou adresu lze předat přenositelným CLI argumentem:

```bash
npm run marketing:capture -- --base-url http://localhost:3000
npm run marketing:capture -- --base-url https://studenthubapp.cz
```

Volitelné přepínače:

```bash
npm run marketing:capture -- --only brigady
npm run marketing:capture -- --only kalendar
npm run marketing:capture -- --headed
npm run marketing:capture -- --no-video
npm run marketing:capture -- --no-screenshots
```

Povolené hodnoty `--only` jsou `intro`, `brigady`, `kalendar`, `mista`, `bydleni`, `partak`, `komunita` a `overview`. Samostatný `overview` používá již existující validní feature klipy v `marketing-output/videos/`.

## Výstupy

Vygenerované soubory jsou v ignorovaném adresáři `marketing-output/`:

- `videos/` – MP4/H.264, 1080 × 1920 px;
- `screenshots/` – PNG, 1080 × 1920 px;
- `metadata/` – stav a technická diagnostika každého flow;
- `debug/` – screenshot chyby, pouze pokud neobsahuje rozpoznaný kontakt;
- `manifest.json` – stav, routy, UTM odkazy a ověřené technické parametry;
- `README.md` – souhrn konkrétního běhu.

Playwright pořizuje zdrojový WebM ve viewportu 432 × 768 px. Vývojová závislost `ffmpeg-static` jej automaticky převede se zachováním poměru stran na 1080 × 1920 px a ověří codec, rozlišení, délku a čitelnost prvního snímku. Screenshoty vznikají přes device scale factor 2,5, takže se nedeformují.

## Bezpečnost

Každý flow běží v novém anonymním browser contextu bez auth state. Skript používá stejné lokální consent a onboarding preference jako existující E2E testy, zamítá geolokační oprávnění a na síťové vrstvě blokuje všechny metody kromě `GET`, `HEAD` a `OPTIONS`. Neotevírá externí CTA a nekliká na like, bookmark, report, komentář, formulář ani publikování.

Selhání jednoho flow nezastaví ostatní. Pokud veřejný komunitní obsah obsahuje rozpoznaný e-mail nebo telefon, příslušný flow se kvůli soukromí přeskočí. Celý příkaz vrátí nenulový exit code pouze tehdy, když nevznikne žádný použitelný výstup nebo selže základní spuštění workflow.
