-- Veřejný odkaz na brněnský výpis není tajná feed URL a neslouží ke scrapingu.
update public.content_sources
set source_url = 'https://www.fajn-brigady.cz/vysledek.html?s_sekce=1&id_lokality=okres-3702',
    updated_at = now()
where id = 'src-fajn-brigady';
