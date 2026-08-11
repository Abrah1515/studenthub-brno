# Registr veřejných fakultních zdrojů

Stav katalogu ověřen k 11. 8. 2026. Režim monitoringu je oddělený od posledního výsledku synchronizace:

- `automatic_publish` – bezpečně strukturovaný zdroj může publikovat události s jistotou nejméně 0,9;
- `automatic_review` – zdroj je nejvýše po 9 hodinách zkontrolován, parsován a verzován, ale nic nezveřejní ani nezruší bez schválení;
- `not_found_monitored` – harmonogram nebyl nalezen, oficiální stránka se však denně kontroluje na nový dokument.

Všech 27 zdrojů je monitorováno (`enabled=true`).

| Univerzita | Fakulta | Oficiální veřejný zdroj | Parser | Režim |
|---|---|---|---|---|
| MUNI | Právnická fakulta | https://is.muni.cz/predmety/obdobi | `muni-is-periods` / PrF | automatic_publish |
| MUNI | Lékařská fakulta | https://is.muni.cz/predmety/obdobi | `muni-is-periods` / LF | automatic_publish |
| MUNI | Přírodovědecká fakulta | https://is.muni.cz/predmety/obdobi | `muni-is-periods` / PřF | automatic_publish |
| MUNI | Filozofická fakulta | https://is.muni.cz/predmety/obdobi | `muni-is-periods` / FF | automatic_publish |
| MUNI | Pedagogická fakulta | https://is.muni.cz/predmety/obdobi | `muni-is-periods` / PdF | automatic_publish |
| MUNI | Farmaceutická fakulta | https://is.muni.cz/predmety/obdobi | `muni-is-periods` / FaF | automatic_publish |
| MUNI | Ekonomicko-správní fakulta | https://is.muni.cz/predmety/obdobi | `muni-is-periods` / ESF | automatic_publish |
| MUNI | Fakulta informatiky | https://is.muni.cz/predmety/obdobi | `muni-is-periods` / FI | automatic_publish |
| MUNI | Fakulta sociálních studií | https://is.muni.cz/predmety/obdobi | `muni-is-periods` / FSS | automatic_publish |
| MUNI | Fakulta sportovních studií | https://is.muni.cz/predmety/obdobi | `muni-is-periods` / FSpS | automatic_publish |
| VUT | FEKT | https://www.vut.cz/uredni-deska/vnitrni-legislativa-fekt/rozhodnuti-s8 | stránkování → detail → PDF.js | automatic_publish |
| VUT | FIT | https://www.fit.vut.cz/study/calendar/ | `vut-fit-html` | automatic_publish |
| VUT | FAST | https://www.fce.vut.cz/pro-studenty/casovy-plan-studia | dohledání dokumentu | automatic_review |
| VUT | FSI | https://www.fme.vutbr.cz/studenti/plan?degree=0&mode=0 | `vut-fsi-html` | automatic_publish |
| VUT | FA | https://www.fa.vut.cz/pages/casovy_plan.aspx | dohledání dokumentu | automatic_review |
| VUT | FCH | https://www.vut.cz/uredni-deska/vnitrni-legislativa-fch/vnitrni-normy-sp103 | detail → příloha → PDF.js | automatic_publish |
| VUT | FP | https://www.vut.cz/uredni-deska/vnitrni-legislativa-fp/rozhodnuti-s56 | detail → PDF.js | automatic_publish |
| VUT | FaVU | https://www.favu.vut.cz/studenti/casovy-plan | dohledání dokumentu | automatic_review |
| MENDELU | Agronomická fakulta | https://af.mendelu.cz/o-fakulte/uredni-deska/ | dohledání PDF | automatic_review |
| MENDELU | Lesnická a dřevařská fakulta | https://ldf.mendelu.cz/student/harmonogram/ | dohledání PDF | automatic_review |
| MENDELU | Provozně ekonomická fakulta | https://pef.mendelu.cz/o-fakulte/uredni-deska/ | `mendelu-pef-html` | automatic_publish |
| MENDELU | Zahradnická fakulta | https://zf.mendelu.cz/harmonogram-akademickeho-roku/ | dohledání PDF | automatic_review |
| MENDELU | FRRMS | https://frrms.mendelu.cz/student/prakticke-informace/ | obecná akademická HTML tabulka | automatic_review |
| VETUNI | Fakulta veterinárního lékařství | https://www.vetuni.cz/Rozpis_vyuky_pro_akademicky_rok | dohledání a PDF.js | automatic_review |
| VETUNI | Fakulta veterinární hygieny a ekologie | https://www.vetuni.cz/Rozpis_vyuky_pro_akademicky_rok | dohledání a PDF.js | automatic_review |
| JAMU | Hudební fakulta | https://is.jamu.cz/predmety/obdobi | `jamu-is-periods` / HF | automatic_publish |
| JAMU | Divadelní fakulta | https://is.jamu.cz/predmety/obdobi | `jamu-is-periods` / DIFA | automatic_publish |

Souhrn: 18 fakultních zdrojů v `automatic_publish`, 9 v `automatic_review` a žádný v `not_found_monitored`.

## Zpracování a bezpečnost

MUNI a JAMU používají veřejný přehled harmonogramů IS. Parser vybírá nejnovější akademický rok s jednoznačnými daty, mapuje stabilní kódy fakultních sloupců a ignoruje ostatní provozní řádky. PEF má vlastní parser záhlaví a z jednoho semestrálního řádku vytváří samostatnou výuku, zkouškové období a registraci.

Rozcestníky se kontrolují na aktuální dokument bez pevného roku v URL. Konektor umí omezené stránkování a nejvýše dvě úrovně odkazu. Kandidát musí být na povolené oficiální HTTPS doméně; přijímací, grantové a jiné nesouvisející dokumenty jsou odmítnuté. PDF konektor kontroluje MIME, `%PDF-` hlavičku, limit 5 MB a 250 stran, ukládá původní hash, snapshot i text. Aktuální PDF s textovou vrstvou lze publikovat jen z explicitního `automatic_publish` zdroje a při úplné shodě akademického roku; OCR a nejasné dokumenty zůstávají v kontrole.

`is.mendelu.cz` zakazuje automatické stahování všem robotům a VETUNI používá Turnstile. Tyto ochrany se neobcházejí: veřejné rozcestníky se monitorují, ale příslušný PDF obsah vyžaduje povolený feed, písemný souhlas nebo ruční kontrolu.

CI používá sanitizované snapshoty skutečných struktur v `tests/fixtures/`. Síťové weby se v unit a databázové integraci nevolají.
