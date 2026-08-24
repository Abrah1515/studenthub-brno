import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { parseHtml } from "@/lib/sources/connectors/html";
import { parsePdf } from "@/lib/sources/connectors/pdf";
import { partitionEventsForMonitoring } from "@/lib/sources/publish-policy";
import { contentSources } from "@/lib/sources/registry";

const categoryCode = { "Výuka": "teaching", "Zkouškové období": "exam", "Registrace předmětů": "course_registration" } as const;

function sqlStatements(sql: string) {
  const statements: string[] = []; let current = ""; let single = false; let double = false; let dollar = ""; let lineComment = false; let blockComment = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]; const next = sql[index + 1] || "";
    if (lineComment) { current += char; if (char === "\n") lineComment = false; continue; }
    if (blockComment) { current += char; if (char === "*" && next === "/") { current += next; index += 1; blockComment = false; } continue; }
    if (!single && !double && !dollar && char === "-" && next === "-") { current += char + next; index += 1; lineComment = true; continue; }
    if (!single && !double && !dollar && char === "/" && next === "*") { current += char + next; index += 1; blockComment = true; continue; }
    if (!single && !double) {
      if (dollar && sql.startsWith(dollar, index)) { current += dollar; index += dollar.length - 1; dollar = ""; continue; }
      if (!dollar && char === "$") { const match = sql.slice(index).match(/^\$[a-zA-Z0-9_]*\$/); if (match) { dollar = match[0]; current += dollar; index += dollar.length - 1; continue; } }
    }
    if (!double && !dollar && char === "'" && next === "'") { current += char + next; index += 1; continue; }
    if (!double && !dollar && char === "'") single = !single;
    if (!single && !dollar && char === "\"") double = !double;
    if (char === ";" && !single && !double && !dollar) { if (current.trim()) statements.push(current.trim()); current = ""; } else current += char;
  }
  if (current.trim()) statements.push(current.trim()); return statements;
}

describe("PostgreSQL migrace, seed, fixture synchronizace a RLS", () => {
  it("projde celý databázový tok na skutečném PostgreSQL enginu", { timeout: 60_000 }, async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon nologin;
        create role authenticated nologin;
        create role service_role nologin bypassrls;
        create schema auth;
        create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb not null default '{}'::jsonb);
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        grant usage on schema public, auth to anon, authenticated, service_role;
      `);
      const files = (await readdir("supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
      expect(files).toHaveLength(30);
      // PGlite does not provide the production pg_cron/pg_net extensions. Dedicated
      // unit tests verify both scheduler migrations and their Vault-only secrets.
      for (const file of files.filter((file) => !file.includes("_scheduler.sql") && !file.includes("_dispatcher.sql"))) {
        const statements = sqlStatements(await readFile(`supabase/migrations/${file}`, "utf8"));
        for (let index = 0; index < statements.length; index += 1) {
          try { await db.exec(`${statements[index]};`); }
          catch (error) { throw new Error(`Migrace ${file}, příkaz ${index + 1} (${statements[index].slice(0, 180).replace(/\s+/g, " ")}) selhal: ${error instanceof Error ? error.message : String(error)}`, { cause: error }); }
        }
      }
      await db.exec(await readFile("supabase/seed.sql", "utf8"));
      expect((await db.query<{ count: number }>("select count(*)::int as count from public.places where status='approved' and is_demo=false")).rows[0].count).toBe(36);
      expect((await db.query<{ count: number }>("select count(*)::int as count from public.community_events where status='published' and source_type='external'")).rows[0].count).toBe(16);
      expect((await db.query<{ count: number }>("select count(*)::int as count from (select city_id,dedupe_key from public.places where status='approved' and is_demo=false group by city_id,dedupe_key having count(*) > 1) duplicates")).rows[0].count).toBe(0);
      await db.exec(`
        insert into auth.users(id,email,email_confirmed_at) values
          ('71111111-1111-4111-8111-111111111111','faculty@example.cz',now()),
          ('71111111-1111-4111-8111-111111111112','city@example.cz',now()),
          ('71111111-1111-4111-8111-111111111113','super@example.cz',now()),
          ('71111111-1111-4111-8111-111111111114','student@example.cz',now());
        update public.profiles set role='faculty_editor', university_id='vut', faculty_id='vut-fekt', city_id='brno' where id='71111111-1111-4111-8111-111111111111';
        update public.profiles set role='city_editor', city_id='brno' where id='71111111-1111-4111-8111-111111111112';
        update public.profiles set role='super_admin', city_id=null where id='71111111-1111-4111-8111-111111111113';
        update public.profiles set username='trusted_student',display_name='Trusted Student',community_rules_accepted_at=now(),account_status='active',is_blocked=false where id='71111111-1111-4111-8111-111111111114';
      `);

      await db.exec(`
        insert into public.community_events(id,author_id,city_id,title,category,starts_at,venue,description,is_free,author_email,management_token_hash,duplicate_fingerprint,status)
        values ('94111111-1111-4111-8111-111111111111','71111111-1111-4111-8111-111111111114','brno','Trusted integration před přidělením','Studium','2032-09-20 18:00:00+02','Veřejná knihovna','Akce vložená před přidělením oprávnění musí čekat na kontrolu.',true,'trusted@example.cz',repeat('2',64),repeat('e',64),'published');
      `);
      expect((await db.query<{ status: string }>("select status from public.community_events where id='94111111-1111-4111-8111-111111111111'")).rows[0].status).toBe("pending");
      await db.query("select public.manage_trusted_event_publisher($1,'grant',$2,$3)", ['71111111-1111-4111-8111-111111111114','Ověřený zástupce studentského spolku','71111111-1111-4111-8111-111111111113']);
      expect((await db.query<{ status: string }>("select status from public.community_events where id='94111111-1111-4111-8111-111111111111'")).rows[0].status).toBe("pending");
      await db.exec(`
        insert into public.community_events(id,author_id,city_id,title,category,starts_at,venue,description,is_free,author_email,management_token_hash,duplicate_fingerprint,status)
        values ('94111111-1111-4111-8111-111111111112','71111111-1111-4111-8111-111111111114','brno','Trusted integration po přidělení','Kultura','2032-09-21 18:00:00+02','Veřejný klub','Akce oprávněného profilu se musí zveřejnit okamžitě.',true,'trusted@example.cz',repeat('3',64),repeat('f',64),'pending');
      `);
      expect((await db.query<{ status: string }>("select status from public.community_events where id='94111111-1111-4111-8111-111111111112'")).rows[0].status).toBe("published");
      await db.query("select public.manage_trusted_event_publisher($1,'suspend',$2,$3)", ['71111111-1111-4111-8111-111111111114','Dočasná kontrola oprávnění','71111111-1111-4111-8111-111111111113']);
      expect((await db.query<{ is_trusted_event_publisher: boolean }>("select public.is_trusted_event_publisher('71111111-1111-4111-8111-111111111114')")).rows[0].is_trusted_event_publisher).toBe(false);
      await db.query("select public.manage_trusted_event_publisher($1,'reactivate',$2,$3)", ['71111111-1111-4111-8111-111111111114','Opětovné ověření vydavatele','71111111-1111-4111-8111-111111111113']);
      await db.query("select public.manage_trusted_event_publisher($1,'revoke',$2,$3)", ['71111111-1111-4111-8111-111111111114','Ukončení spolupráce s vydavatelem','71111111-1111-4111-8111-111111111113']);
      await db.exec(`
        insert into public.community_events(id,author_id,city_id,title,category,starts_at,venue,description,is_free,author_email,management_token_hash,duplicate_fingerprint,status)
        values ('94111111-1111-4111-8111-111111111113','71111111-1111-4111-8111-111111111114','brno','Trusted integration po odebrání','Sport','2032-09-22 18:00:00+02','Veřejné hřiště','Akce po odebrání oprávnění musí znovu čekat na schválení.',true,'trusted@example.cz',repeat('4',64),repeat('1',64),'published');
      `);
      expect((await db.query<{ status: string }>("select status from public.community_events where id='94111111-1111-4111-8111-111111111113'")).rows[0].status).toBe("pending");
      expect((await db.query<{ count: number }>("select count(*)::int as count from public.profile_permission_audit where profile_id='71111111-1111-4111-8111-111111111114'")).rows[0].count).toBe(4);
      expect((await db.query<{ role: string }>("select role from public.profiles where id='71111111-1111-4111-8111-111111111114'")).rows[0].role).toBe("user");
      expect((await db.query("update public.community_events set author_id=null,author_email='deleted@invalid.local' where id='94111111-1111-4111-8111-111111111111' returning id")).rows).toHaveLength(1);
      await expect(db.query("select public.manage_trusted_event_publisher($1,'grant',$2,$1)", ['71111111-1111-4111-8111-111111111113','Zakázané přidělení sobě'])).rejects.toThrow(/cannot grant.*self/i);

      await db.exec(`
        insert into public.community_profiles(user_id,nickname,city_id,university_id,faculty_id) values
          ('71111111-1111-4111-8111-111111111111','Ada','brno','vut','vut-fekt'),
          ('71111111-1111-4111-8111-111111111112','Bětka','brno','muni','muni-fi'),
          ('71111111-1111-4111-8111-111111111113','Cyril','brno',null,null);
        insert into public.community_posts(id,author_id,author_nickname,city_id,university_id,faculty_id,category,body,duplicate_fingerprint) values
          ('a1111111-1111-4111-8111-111111111111','71111111-1111-4111-8111-111111111111','Ada','brno','vut','vut-fekt','Studium','Původní text otázky pro integrační ověření.',repeat('a',64)),
          ('a1111111-1111-4111-8111-111111111112','71111111-1111-4111-8111-111111111111','Ada','brno',null,null,'Technika','Obsah určený k automatickému skrytí po hlášeních.',repeat('b',64)),
          ('a1111111-1111-4111-8111-111111111113','71111111-1111-4111-8111-111111111112','Bětka','brno','muni','muni-fi','Doprava','Příspěvek určený k bezpečnému soft delete.',repeat('c',64));
        update public.community_posts set body='Upravený text vlastní otázky pro integrační ověření.' where id='a1111111-1111-4111-8111-111111111111';
        update public.community_posts set status='deleted',deleted_at=now() where id='a1111111-1111-4111-8111-111111111113';
        insert into public.community_comments(id,post_id,author_id,author_nickname,body) values
          ('b1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','71111111-1111-4111-8111-111111111112','Bětka','První užitečná odpověď.'),
          ('b1111111-1111-4111-8111-111111111112','a1111111-1111-4111-8111-111111111111','71111111-1111-4111-8111-111111111113','Cyril','Druhá užitečná odpověď.');
        update public.community_comments set is_best=true where id='b1111111-1111-4111-8111-111111111111';
        insert into public.community_reactions(user_id,target_type,target_id) values
          ('71111111-1111-4111-8111-111111111111','post','a1111111-1111-4111-8111-111111111111'),
          ('71111111-1111-4111-8111-111111111112','post','a1111111-1111-4111-8111-111111111111'),
          ('71111111-1111-4111-8111-111111111113','comment','b1111111-1111-4111-8111-111111111111');
        insert into public.community_reports(reporter_id,target_type,target_id,reason,city_id) values
          ('71111111-1111-4111-8111-111111111111','post','a1111111-1111-4111-8111-111111111112','spam','brno'),
          ('71111111-1111-4111-8111-111111111112','post','a1111111-1111-4111-8111-111111111112','fraud','brno'),
          ('71111111-1111-4111-8111-111111111113','post','a1111111-1111-4111-8111-111111111112','dangerous','brno');
      `);
      expect((await db.query<{ body: string; helpful_count: number; comment_count: number }>("select body,helpful_count,comment_count from public.community_posts where id='a1111111-1111-4111-8111-111111111111'")).rows[0]).toEqual({ body: "Upravený text vlastní otázky pro integrační ověření.", helpful_count: 2, comment_count: 2 });
      expect((await db.query<{ status: string; report_count: number }>("select status,report_count from public.community_posts where id='a1111111-1111-4111-8111-111111111112'")).rows[0]).toEqual({ status: "hidden", report_count: 3 });
      expect((await db.query<{ status: string; deleted_at: Date | null }>("select status,deleted_at from public.community_posts where id='a1111111-1111-4111-8111-111111111113'")).rows[0].status).toBe("deleted");
      expect((await db.query<{ is_best: boolean; helpful_count: number }>("select is_best,helpful_count from public.community_comments where id='b1111111-1111-4111-8111-111111111111'")).rows[0]).toEqual({ is_best: true, helpful_count: 1 });
      expect((await db.query<{ count: number }>("select count(*)::int as count from public.community_moderation_history where action='auto_hidden' and target_id='a1111111-1111-4111-8111-111111111112'")).rows[0].count).toBe(1);
      await expect(db.exec("insert into public.community_reports(reporter_id,target_type,target_id,reason,city_id) values ('71111111-1111-4111-8111-111111111114','post','a1111111-1111-4111-8111-111111111199','spam','brno')")).rejects.toThrow(/report city does not match target/);

      const modes = await db.query<{ monitoring_mode: string; count: number }>("select monitoring_mode, count(*)::int as count from public.content_sources where source_type='academic_calendar' group by monitoring_mode order by monitoring_mode");
      expect(modes.rows).toEqual([{ monitoring_mode: "automatic_publish", count: 18 }, { monitoring_mode: "automatic_review", count: 9 }]);
      expect((await db.query<{ count: number }>("select count(*)::int as count from public.content_sources where source_type='academic_calendar' and enabled")).rows[0].count).toBe(27);

      const pef = contentSources.find((item) => item.id === "src-mendelu-pef")!;
      const pefResult = await parseHtml({ source: pef, body: await readFile("tests/fixtures/mendelu-pef.html"), contentType: "text/html", checkedAt: "2026-08-02T10:00:00Z" });
      const pefPartition = partitionEventsForMonitoring(pef.monitoringMode, pefResult.events);
      expect(pefPartition.publishable).toHaveLength(6); expect(pefPartition.review).toHaveLength(0);
      const published = pefPartition.publishable[0];
      await db.query(`insert into public.academic_events (id,external_id,title,description,category,school,faculty,starts_at,ends_at,all_day,timezone,academic_year,source_id,source_name,source_url,source_hash,confidence,last_verified_at,verification_status,status,is_demo,scope_type,university_id,faculty_id) values ('61111111-1111-4111-8111-111111111111',$1,$2,$3,$4,'MENDELU','PEF',$5,$6,$7,'Europe/Prague',$8,$9,'Fixture PEF',$10,$11,$12,$13,'verified','approved',false,'faculty','mendelu','mendelu-pef')`, [published.externalId, `Integration approved · ${published.title}`, published.description, categoryCode[published.category as keyof typeof categoryCode], published.startAt, published.endAt, published.allDay, published.academicYear, published.sourceId, published.sourceUrl, published.sourceHash, published.confidence, published.lastVerifiedAt]);
      await db.query(`insert into public.academic_events (id,title,description,category,school,faculty,starts_at,all_day,timezone,academic_year,source_name,source_url,confidence,last_verified_at,verification_status,status,is_demo,scope_type,university_id,faculty_id) values ('61111111-1111-4111-8111-111111111112','Integration pending','Nesmí být veřejná','teaching','MENDELU','PEF','2026-09-21 00:00:00+02',true,'Europe/Prague','2026/2027','Fixture','https://pef.mendelu.cz/',0.7,'2026-08-02','needs_review','pending',false,'faculty','mendelu','mendelu-pef')`);
      await db.exec(`
        insert into public.academic_events (id,title,description,category,school,faculty,starts_at,all_day,timezone,academic_year,source_name,source_url,confidence,last_verified_at,verification_status,status,is_demo,scope_type,university_id,faculty_id)
        values
          ('61111111-1111-4111-8111-111111111113','RLS FEKT','Rozsah fakultního editora','teaching','VUT','FEKT','2026-09-14 00:00:00+02',true,'Europe/Prague','2026/2027','Fixture','https://www.fekt.vut.cz/',0.8,'2026-08-02','needs_review','pending',false,'faculty','vut','vut-fekt'),
          ('61111111-1111-4111-8111-111111111114','RLS FIT','Cizí fakulta','teaching','VUT','FIT','2026-09-14 00:00:00+02',true,'Europe/Prague','2026/2027','Fixture','https://www.fit.vut.cz/',0.8,'2026-08-02','needs_review','pending',false,'faculty','vut','vut-fit');
        insert into public.service_requests(id,city_id,name,email,service_type,description,preferred_date,consent_at,status)
        values ('81111111-1111-4111-8111-111111111111','brno','RLS Student','rls@example.cz','backup','Neveřejná testovací poptávka pro ověření RLS.','2026-08-10',now(),'new');
        insert into public.buddy_posts(id,owner_id,city_id,activity_type,approximate_location,starts_at,description,max_participants,status,moderation_status,expires_at)
        values ('91111111-1111-4111-8111-111111111111','71111111-1111-4111-8111-111111111111','brno','study','Veřejná knihovna','2030-09-14 18:00:00+02','Bezpečný veřejný popis integračního setkání bez kontaktů.',2,'active','approved','2030-09-15 06:00:00+02');
        insert into public.buddy_join_requests(id,post_id,requester_id,message,status) values
          ('92111111-1111-4111-8111-111111111111','91111111-1111-4111-8111-111111111111','71111111-1111-4111-8111-111111111112','První žádost','pending'),
          ('92111111-1111-4111-8111-111111111112','91111111-1111-4111-8111-111111111111','71111111-1111-4111-8111-111111111113','Druhá žádost','pending');
        update public.buddy_join_requests set status='accepted' where id='92111111-1111-4111-8111-111111111111';
        insert into public.community_events(id,city_id,title,category,starts_at,venue,description,is_free,author_email,management_token_hash,duplicate_fingerprint,status)
        values
          ('93111111-1111-4111-8111-111111111111','brno','Veřejná studentská akce','Studium','2030-09-20 18:00:00+02','Veřejná knihovna','Bezpečný veřejný popis komunitní studentské akce.',true,'private@example.cz',repeat('a',64),repeat('b',64),'published'),
          ('93111111-1111-4111-8111-111111111112','brno','Ukončená studentská akce','Kultura','2020-09-20 18:00:00+02','Centrum Brna','Bezpečný popis již ukončené komunitní akce.',true,'archive@example.cz',repeat('c',64),repeat('d',64),'published');
        insert into public.content_reports(target_type,target_id,reporter_session_hash,reason,city_id) values
          ('community_event','93111111-1111-4111-8111-111111111111',repeat('1',64),'spam','brno'),
          ('community_event','93111111-1111-4111-8111-111111111111',repeat('2',64),'spam','brno'),
          ('community_event','93111111-1111-4111-8111-111111111111',repeat('3',64),'spam','brno');
        update public.academic_events
          set description = description || ' · výchozí audit historie'
          where id in ('61111111-1111-4111-8111-111111111113','61111111-1111-4111-8111-111111111114');
        insert into public.anonymous_installations(id,token_hash,city_id,university_id,faculty_id,study_year) values
          ('a2111111-1111-4111-8111-111111111111',repeat('d',64),'brno','vut','vut-fekt',2),
          ('a2111111-1111-4111-8111-111111111112',repeat('e',64),'brno','vut','vut-fit',2);
        insert into public.saved_items(installation_id,target_type,target_id,is_favorite,is_watched,event_starts_at) values
          ('a2111111-1111-4111-8111-111111111111','academic_event','61111111-1111-4111-8111-111111111113',true,true,'2026-09-14 00:00:00+02'),
          ('a2111111-1111-4111-8111-111111111112','academic_event','61111111-1111-4111-8111-111111111114',true,false,'2026-09-14 00:00:00+02');
        insert into public.place_live_reports(place_id,installation_id,status,report_window)
          select id,'a2111111-1111-4111-8111-111111111111','many_seats',date_trunc('hour',now())
          from public.places where city_id='brno' order by id limit 1;
        update public.anonymous_installations set muted_categories=array['teaching'] where id='a2111111-1111-4111-8111-111111111111';
        update public.academic_events set description=description || ' · změna zůstává v interním centru' where id='61111111-1111-4111-8111-111111111113';
      `);
      expect((await db.query<{ count: number }>("select count(*)::int as count from public.internal_notifications where installation_id='a2111111-1111-4111-8111-111111111111' and kind='academic_change'")).rows[0].count).toBe(1);
      const immediatelyPublished = await db.query<{ moderation_status: string }>("insert into public.buddy_posts(id,owner_id,city_id,activity_type,approximate_location,starts_at,description,max_participants,status,expires_at) values ('91111111-1111-4111-8111-111111111112','71111111-1111-4111-8111-111111111111','brno','study','Testovací knihovna','2030-10-14 18:00:00+02','Příspěvek se po ověření e-mailu zveřejní bez čekání na administrátora.',3,'active','2030-10-15 06:00:00+02') returning moderation_status");
      expect(immediatelyPublished.rows[0].moderation_status).toBe("approved");
      await db.exec("insert into public.content_reports(target_type,target_id,reporter_session_hash,reason,city_id) values ('buddy_post','91111111-1111-4111-8111-111111111112',repeat('4',64),'spam','brno'),('buddy_post','91111111-1111-4111-8111-111111111112',repeat('5',64),'spam','brno'),('buddy_post','91111111-1111-4111-8111-111111111112',repeat('6',64),'spam','brno')");
      expect((await db.query<{ moderation_status: string; report_count: number }>("select moderation_status,report_count from public.buddy_posts where id='91111111-1111-4111-8111-111111111112'")).rows[0]).toEqual({ moderation_status: "hidden", report_count: 3 });
      await expect(db.exec("update public.buddy_join_requests set status='accepted' where id='92111111-1111-4111-8111-111111111112'")).rejects.toThrow(/capacity/i);
      expect((await db.query<{ status: string; report_count: number }>("select status,report_count from public.community_events where id='93111111-1111-4111-8111-111111111111'")).rows[0]).toEqual({ status: "hidden", report_count: 3 });
      expect((await db.query<{ archive_expired_community_events: number }>("select public.archive_expired_community_events()")).rows[0].archive_expired_community_events).toBe(1);

      const vetuni = contentSources.find((item) => item.id === "src-vetuni-fvl")!;
      const pdfResult = await parsePdf({ source: { ...vetuni, format: "pdf", parserKey: "pdf-review", sourceUrl: "https://www.vetuni.cz/files/fixture.pdf" }, body: await readFile("tests/fixtures/calendar-text.pdf"), contentType: "application/pdf", checkedAt: "2026-08-02T10:00:00Z" });
      const pdfPartition = partitionEventsForMonitoring(vetuni.monitoringMode, pdfResult.events);
      expect(pdfPartition.publishable).toHaveLength(0); expect(pdfPartition.review).toHaveLength(2);
      const run = await db.query<{ id: string }>("insert into public.source_sync_runs(source_id,status,finished_at,discovered_count,published_count,review_count) values ('src-vetuni-fvl','review',now(),2,0,2) returning id");
      await db.query("insert into public.source_review_queue(source_id,sync_run_id,proposed_payload,reason,status,source_text,confidence,source_document_title) values ('src-vetuni-fvl',$1,$2::jsonb,'low_confidence','pending',$3,$4,$5)", [run.rows[0].id, JSON.stringify({ events: pdfPartition.review, warnings: pdfResult.warnings }), pdfResult.sourceText, Math.max(...pdfPartition.review.map((item) => item.confidence)), pdfResult.documentTitle]);
      expect((await db.query<{ count: number }>("select count(*)::int as count from public.source_review_queue where source_id='src-vetuni-fvl' and status='pending'")).rows[0].count).toBe(1);

      await db.exec(`
        insert into public.marketplace_listings(id,city_id,listing_type,category,title,short_description,description,price_mode,price_amount,price_scope,university_id,faculty_id,semester,material_format,item_condition,handoff_method,handoff_location,public_alias,seller_email,seller_email_hash,request_fingerprint,management_token_hash,duplicate_fingerprint,copyright_confirmed,privacy_consent_at,status,email_verified_at,published_at,expires_at)
        values
          ('c1111111-1111-4111-8111-111111111111','brno','offer','textbook','Integrační učebnice','Zachovalá fyzická učebnice.','Zachovalá fyzická učebnice určená k bezpečnému integračnímu testu.','fixed',250,'item','vut','vut-fekt','winter','printed','used','in_person','Technická','Student', 'seller@example.cz',repeat('a',64),repeat('b',24),repeat('c',64),repeat('d',64),true,now(),'active',now(),now(),now()+interval '30 days'),
          ('c1111111-1111-4111-8111-111111111112','brno','wanted','other','Expirovaná poptávka','Poptávka určená k expiraci.','Poptávka určená pouze k ověření databázové automatické expirace.','negotiable',null,'item',null,null,'not_applicable','printed','used','shipping',null,'Student', 'expired@example.cz',repeat('e',64),repeat('f',24),repeat('1',64),repeat('2',64),true,now(),'sold',now(),now(),now()-interval '1 hour');
        insert into public.marketplace_messages(listing_id,buyer_email,message,consent_at,request_fingerprint)
          values ('c1111111-1111-4111-8111-111111111111','buyer@example.cz','Soukromá zpráva zájemce nesmí být dostupná přes přímé RLS čtení.',now(),repeat('3',24));
        insert into public.marketplace_reports(listing_id,reporter_hash,reason) values
          ('c1111111-1111-4111-8111-111111111111',repeat('4',24),'copyright'),
          ('c1111111-1111-4111-8111-111111111111',repeat('5',24),'academic_integrity'),
          ('c1111111-1111-4111-8111-111111111111',repeat('6',24),'fraud');
      `);
      expect((await db.query<{ status: string; report_count: number }>("select status,report_count from public.marketplace_listings where id='c1111111-1111-4111-8111-111111111111'")).rows[0]).toEqual({ status: "hidden", report_count: 3 });
      expect((await db.query<{ expire_marketplace_listings: number }>("select public.expire_marketplace_listings()")).rows[0].expire_marketplace_listings).toBe(1);
      expect((await db.query<{ status: string }>("select status from public.marketplace_listings where id='c1111111-1111-4111-8111-111111111112'")).rows[0].status).toBe("expired");
      expect((await db.query<{ previous_status: string; new_status: string }>("select previous_status,new_status from public.marketplace_history where listing_id='c1111111-1111-4111-8111-111111111112' and event_type='expired'")).rows[0]).toEqual({ previous_status: "sold", new_status: "expired" });
      expect((await db.query<{ consume_marketplace_rate_limit: boolean }>("select public.consume_marketplace_rate_limit(repeat('7',24),'create',1,3600)")).rows[0].consume_marketplace_rate_limit).toBe(true);
      expect((await db.query<{ consume_marketplace_rate_limit: boolean }>("select public.consume_marketplace_rate_limit(repeat('7',24),'create',1,3600)")).rows[0].consume_marketplace_rate_limit).toBe(false);

      await db.exec("set role anon");
      const publicEvents = await db.query<{ title: string }>("select title from public.academic_events where title like 'Integration %' order by title");
      expect(publicEvents.rows.map((row) => row.title)).toEqual([expect.stringMatching(/^Integration approved/)]);
      await expect(db.query("select * from public.service_requests")).rejects.toThrow();
      await expect(db.query("select * from public.content_sources")).rejects.toThrow();
      await expect(db.query("select * from public.community_events")).rejects.toThrow();
      await expect(db.query("select * from public.anonymous_installations")).rejects.toThrow();
      await expect(db.query("select * from public.saved_items")).rejects.toThrow();
      await expect(db.query("select * from public.push_subscriptions")).rejects.toThrow();
      await expect(db.query("select * from public.place_live_reports")).rejects.toThrow();
      await expect(db.query("select * from public.academic_event_changes")).rejects.toThrow();
      await expect(db.query("select * from public.marketplace_listings")).rejects.toThrow();
      await expect(db.query("select * from public.marketplace_messages")).rejects.toThrow();
      await expect(db.query("select * from public.marketplace_reports")).rejects.toThrow();
      await expect(db.query("select * from public.profile_permissions")).rejects.toThrow();
      await expect(db.query("select * from public.profile_permission_audit")).rejects.toThrow();
      expect((await db.query<{ approximate_location: string }>("select approximate_location from public.buddy_posts")).rows).toEqual([{ approximate_location: "Veřejná knihovna" }]);
      expect((await db.query<{ body: string }>("select body from public.community_posts order by created_at,id")).rows).toEqual([{ body: "Upravený text vlastní otázky pro integrační ověření." }]);
      await expect(db.query("select author_id from public.community_posts")).rejects.toThrow();
      await expect(db.query("insert into public.page_views(path,city_id) values ('/obchazeni-souhlasu','brno')")).rejects.toThrow();
      await db.exec("reset role");

      await db.query("select set_config('request.jwt.claim.sub',$1,false)", ["71111111-1111-4111-8111-111111111111"]); await db.exec("set role authenticated");
      await expect(db.query("select seller_email from public.marketplace_listings")).rejects.toThrow();
      await expect(db.query("select buyer_email from public.marketplace_messages")).rejects.toThrow();
      expect((await db.query<{ title: string }>("select title from public.academic_events where title like 'RLS %' order by title")).rows.map((row) => row.title)).toEqual(["RLS FEKT"]);
      expect((await db.query("update public.academic_events set description='Upraveno FEKT' where title='RLS FEKT' returning id")).rows).toHaveLength(1);
      expect((await db.query("update public.academic_events set description='Zakázáno' where title='RLS FIT' returning id")).rows).toHaveLength(0);
      expect((await db.query("select distinct academic_event_id from public.academic_event_changes")).rows).toHaveLength(1);
      expect((await db.query("select id from public.anonymous_installations")).rows).toHaveLength(0);
      expect((await db.query("select id from public.place_live_reports")).rows).toHaveLength(0);
      await expect(db.query("insert into public.buddy_posts(owner_id,city_id,activity_type,approximate_location,starts_at,description,max_participants,expires_at) values ('71111111-1111-4111-8111-111111111111','brno','study','Obejití API','2031-01-01 18:00:00+01','Přímý zápis musí odmítnout databázová oprávnění.',3,'2031-01-02 06:00:00+01')")).rejects.toThrow();
      expect((await db.query("select * from public.service_requests")).rows).toHaveLength(0); expect((await db.query("select * from public.community_events")).rows).toHaveLength(0); await db.exec("reset role");

      await db.query("select set_config('request.jwt.claim.sub',$1,false)", ["71111111-1111-4111-8111-111111111114"]); await db.exec("set role authenticated");
      expect((await db.query<{ is_super_admin: boolean }>("select public.is_super_admin()")).rows[0].is_super_admin).toBe(false);
      expect((await db.query("update public.community_events set description='Vlastní povolená úprava komunitní akce.' where id='94111111-1111-4111-8111-111111111112' returning id,status")).rows).toEqual([{ id: "94111111-1111-4111-8111-111111111112", status: "pending" }]);
      expect((await db.query("update public.community_events set description='Cizí zakázaná úprava.' where id='93111111-1111-4111-8111-111111111111' returning id")).rows).toHaveLength(0);
      await expect(db.query("update public.community_events set author_id='71111111-1111-4111-8111-111111111112' where id='94111111-1111-4111-8111-111111111112'")).rejects.toThrow();
      await expect(db.query("select public.manage_trusted_event_publisher('71111111-1111-4111-8111-111111111114','grant','Podvržené přidělení','71111111-1111-4111-8111-111111111113')")).rejects.toThrow();
      expect((await db.query("select id from public.profile_permissions")).rows).toHaveLength(0);
      await db.exec("reset role");

      await db.query("select set_config('request.jwt.claim.sub',$1,false)", ["71111111-1111-4111-8111-111111111111"]); await db.exec("set role authenticated");
      expect((await db.query("update public.community_posts set body='Vlastní povolená úprava.' where id='a1111111-1111-4111-8111-111111111111' returning id")).rows).toHaveLength(1);
      await expect(db.query("update public.community_posts set status='active' where id='a1111111-1111-4111-8111-111111111112'")).rejects.toThrow();
      await db.exec("reset role");

      await db.query("select set_config('request.jwt.claim.sub',$1,false)", ["71111111-1111-4111-8111-111111111114"]); await db.exec("set role authenticated");
      expect((await db.query("update public.community_posts set body='Cizí zakázaná úprava.' where id='a1111111-1111-4111-8111-111111111111' returning id")).rows).toHaveLength(0);
      await db.exec("reset role");

      await db.query("select set_config('request.jwt.claim.sub',$1,false)", ["71111111-1111-4111-8111-111111111112"]); await db.exec("set role authenticated");
      expect((await db.query<{ title: string }>("select title from public.academic_events where title like 'RLS %' order by title")).rows.map((row) => row.title)).toEqual(["RLS FEKT", "RLS FIT"]);
      expect((await db.query("update public.academic_events set description='Upraveno městem' where title='RLS FIT' returning id")).rows).toHaveLength(1);
      expect((await db.query("select distinct academic_event_id from public.academic_event_changes")).rows).toHaveLength(2);
      expect((await db.query("select id from public.place_live_reports")).rows).toHaveLength(1);
      expect((await db.query("select id from public.service_requests where id='81111111-1111-4111-8111-111111111111'")).rows).toHaveLength(1); expect((await db.query("select author_email from public.community_events where source_type='community'")).rows).toHaveLength(5); await db.exec("reset role");

      await db.query("select set_config('request.jwt.claim.sub',$1,false)", ["71111111-1111-4111-8111-111111111113"]); await db.exec("set role authenticated");
      expect((await db.query<{ title: string }>("select title from public.academic_events where title like 'RLS %' order by title")).rows.map((row) => row.title)).toEqual(["RLS FEKT", "RLS FIT"]);
      expect((await db.query("select id from public.anonymous_installations")).rows).toHaveLength(2);
      expect((await db.query("select id from public.saved_items")).rows).toHaveLength(2);
      expect((await db.query("select id from public.place_live_reports")).rows).toHaveLength(1);
      expect((await db.query("select distinct academic_event_id from public.academic_event_changes")).rows).toHaveLength(2);
      expect((await db.query("select profile_id,status from public.profile_permissions")).rows).toEqual([{ profile_id: "71111111-1111-4111-8111-111111111114", status: "revoked" }]);
      expect((await db.query<{ action: string }>("select action from public.profile_permission_audit order by id")).rows.map((row) => row.action)).toEqual(["granted", "suspended", "reactivated", "revoked"]);
      await db.exec("reset role");
    } finally { await db.close(); }
  });
});
