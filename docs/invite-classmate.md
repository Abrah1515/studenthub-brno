# Pozvat spolužáka

Dobrovolné sdílení z profilu, pomocného menu a výběru města. Nativní Web Share
má přednost; zrušení není úspěšné sdílení. Fallback obsahuje kopii, WhatsApp,
vlastní e-mailový klient a lokálně generovaný QR. Messenger používá kopii.
Žádné kontakty, adresát, účet ani soukromá routa nevstupují do odkazu.

Publikovaná města poskytuje stávající serverový seznam. Pevná HTTPS doména,
veřejný městský vstup a pouze `utm_source`, `utm_medium=share`,
`utm_campaign=invite_classmate`. Bez referral systému a databázové migrace.

Po souhlasu s analytikou se měří otevření, úspěšná kopie a vyřešený příslib
nativního sdílení (nikoli doručení zprávy). Server znovu ověří consent cookie,
origin, pevné enum hodnoty a stávající distribuovaný rate limit. Události
`StudentHub invite event` jsou pouze v zabezpečených Vercel serverových logách,
podléhají jejich době uchování; nejsou přimíchávány do statistik návštěvnosti.
Log obsahuje jen akci, kanál a veřejné město. Selhání měření neblokuje sdílení.

Fyzický systémový výběr příjemce a odeslání vždy provádí uživatel v cílové
aplikaci. Automatické testy simulují browser API, nikdy nikomu neodesílají zprávy.
