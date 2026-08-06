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
      expect(files).toHaveLength(11);
      for (const file of files) {
        const statements = sqlStatements(await readFile(`supabase/migrations/${file}`, "utf8"));
        for (let index = 0; index < statements.length; index += 1) {
          try { await db.exec(`${statements[index]};`); }
          catch (error) { throw new Error(`Migrace ${file}, příkaz ${index + 1} (${statements[index].slice(0, 180).replace(/\s+/g, " ")}) selhal: ${error instanceof Error ? error.message : String(error)}`, { cause: error }); }
        }
      }
      await db.exec(await readFile("supabase/seed.sql", "utf8"));
      expect((await db.query<{ count: number }>("select count(*)::int as count from public.places where status='approved' and is_demo=false")).rows[0].count).toBe(30);
      await db.exec(`
        insert into auth.users(id,email,email_confirmed_at) values
          ('71111111-1111-4111-8111-111111111111','faculty@example.cz',now()),
          ('71111111-1111-4111-8111-111111111112','city@example.cz',now()),
          ('71111111-1111-4111-8111-111111111113','super@example.cz',now());
        update public.profiles set role='faculty_editor', university_id='vut', faculty_id='vut-fekt', city_id='brno' where id='71111111-1111-4111-8111-111111111111';
        update public.profiles set role='city_editor', city_id='brno' where id='71111111-1111-4111-8111-111111111112';
        update public.profiles set role='super_admin', city_id=null where id='71111111-1111-4111-8111-111111111113';
      `);

      const modes = await db.query<{ monitoring_mode: string; count: number }>("select monitoring_mode, count(*)::int as count from public.content_sources where source_type='academic_calendar' group by monitoring_mode order by monitoring_mode");
      expect(modes.rows).toEqual([{ monitoring_mode: "automatic_publish", count: 15 }, { monitoring_mode: "automatic_review", count: 11 }, { monitoring_mode: "not_found_monitored", count: 1 }]);
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
      `);
      await expect(db.exec("update public.buddy_join_requests set status='accepted' where id='92111111-1111-4111-8111-111111111112'")).rejects.toThrow(/capacity/i);

      const vetuni = contentSources.find((item) => item.id === "src-vetuni-fvl")!;
      const pdfResult = await parsePdf({ source: { ...vetuni, format: "pdf", parserKey: "pdf-review", sourceUrl: "https://www.vetuni.cz/files/fixture.pdf" }, body: await readFile("tests/fixtures/calendar-text.pdf"), contentType: "application/pdf", checkedAt: "2026-08-02T10:00:00Z" });
      const pdfPartition = partitionEventsForMonitoring(vetuni.monitoringMode, pdfResult.events);
      expect(pdfPartition.publishable).toHaveLength(0); expect(pdfPartition.review).toHaveLength(2);
      const run = await db.query<{ id: string }>("insert into public.source_sync_runs(source_id,status,finished_at,discovered_count,published_count,review_count) values ('src-vetuni-fvl','review',now(),2,0,2) returning id");
      await db.query("insert into public.source_review_queue(source_id,sync_run_id,proposed_payload,reason,status,source_text,confidence,source_document_title) values ('src-vetuni-fvl',$1,$2::jsonb,'low_confidence','pending',$3,$4,$5)", [run.rows[0].id, JSON.stringify({ events: pdfPartition.review, warnings: pdfResult.warnings }), pdfResult.sourceText, Math.max(...pdfPartition.review.map((item) => item.confidence)), pdfResult.documentTitle]);
      expect((await db.query<{ count: number }>("select count(*)::int as count from public.source_review_queue where source_id='src-vetuni-fvl' and status='pending'")).rows[0].count).toBe(1);

      await db.exec("set role anon");
      const publicEvents = await db.query<{ title: string }>("select title from public.academic_events where title like 'Integration %' order by title");
      expect(publicEvents.rows.map((row) => row.title)).toEqual([expect.stringMatching(/^Integration approved/)]);
      await expect(db.query("select * from public.service_requests")).rejects.toThrow();
      await expect(db.query("select * from public.content_sources")).rejects.toThrow();
      expect((await db.query<{ approximate_location: string }>("select approximate_location from public.buddy_posts")).rows).toEqual([{ approximate_location: "Veřejná knihovna" }]);
      await expect(db.query("insert into public.page_views(path,city_id) values ('/obchazeni-souhlasu','brno')")).rejects.toThrow();
      await db.exec("reset role");

      await db.query("select set_config('request.jwt.claim.sub',$1,false)", ["71111111-1111-4111-8111-111111111111"]); await db.exec("set role authenticated");
      expect((await db.query<{ title: string }>("select title from public.academic_events where title like 'RLS %' order by title")).rows.map((row) => row.title)).toEqual(["RLS FEKT"]);
      expect((await db.query("update public.academic_events set description='Upraveno FEKT' where title='RLS FEKT' returning id")).rows).toHaveLength(1);
      expect((await db.query("update public.academic_events set description='Zakázáno' where title='RLS FIT' returning id")).rows).toHaveLength(0);
      await expect(db.query("insert into public.buddy_posts(owner_id,city_id,activity_type,approximate_location,starts_at,description,max_participants,expires_at) values ('71111111-1111-4111-8111-111111111111','brno','study','Obejití API','2031-01-01 18:00:00+01','Přímý zápis musí odmítnout databázová oprávnění.',3,'2031-01-02 06:00:00+01')")).rejects.toThrow();
      expect((await db.query("select * from public.service_requests")).rows).toHaveLength(0); await db.exec("reset role");

      await db.query("select set_config('request.jwt.claim.sub',$1,false)", ["71111111-1111-4111-8111-111111111112"]); await db.exec("set role authenticated");
      expect((await db.query<{ title: string }>("select title from public.academic_events where title like 'RLS %' order by title")).rows.map((row) => row.title)).toEqual(["RLS FEKT", "RLS FIT"]);
      expect((await db.query("update public.academic_events set description='Upraveno městem' where title='RLS FIT' returning id")).rows).toHaveLength(1);
      expect((await db.query("select id from public.service_requests where id='81111111-1111-4111-8111-111111111111'")).rows).toHaveLength(1); await db.exec("reset role");

      await db.query("select set_config('request.jwt.claim.sub',$1,false)", ["71111111-1111-4111-8111-111111111113"]); await db.exec("set role authenticated");
      expect((await db.query<{ title: string }>("select title from public.academic_events where title like 'RLS %' order by title")).rows.map((row) => row.title)).toEqual(["RLS FEKT", "RLS FIT"]); await db.exec("reset role");
    } finally { await db.close(); }
  });
});
