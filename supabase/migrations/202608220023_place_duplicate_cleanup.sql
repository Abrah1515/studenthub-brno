-- Odstraní pouze nově vloženou duplicitní kartu KUK, pokud už v databázi
-- existuje starší ověřený záznam stejného fyzického místa. Samostatný nový
-- záznam se nemaže, takže migrace je bezpečná i pro čistou instalaci.
delete from public.places as inserted
where inserted.id = '62222222-2222-4222-8222-222222222232'
  and exists (
    select 1
    from public.places as existing
    where existing.id <> inserted.id
      and existing.city_id = inserted.city_id
      and lower(trim(existing.name)) = lower(trim(inserted.name))
      and abs(existing.latitude - inserted.latitude) < 0.003
      and abs(existing.longitude - inserted.longitude) < 0.003
  );
