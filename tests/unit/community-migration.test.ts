import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("supabase/migrations/202608170021_student_community.sql"), "utf8");
describe("databázová ochrana Studentské komunity", () => {
  it("obsahuje všechny tabulky, indexy a RLS", () => { for (const table of ["community_profiles", "community_posts", "community_comments", "community_reactions", "community_reports", "community_moderation_history"]) expect(migration).toContain(`public.${table}`); expect(migration).toContain("enable row level security"); expect(migration).toContain("community_posts_popular_idx"); });
  it("počítá unikátní reakce, komentáře a nezávislá hlášení", () => { expect(migration).toContain("unique (user_id,target_type,target_id)"); expect(migration).toContain("unique (reporter_id,target_type,target_id)"); expect(migration).toContain("refresh_community_reaction_count"); expect(migration).toContain("refresh_community_comment_count"); expect(migration).toContain("auto_hide_threshold"); });
  it("veřejný grant vynechává author_id a e-mail", () => { const publicPostGrant = migration.match(/grant select \(([^;]+)\) on public\.community_posts to anon,authenticated/)?.[1] || ""; expect(publicPostGrant).not.toContain("author_id"); expect(publicPostGrant).not.toContain("email"); });
});
