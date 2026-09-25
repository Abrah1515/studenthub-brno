import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buddyPostUpdateSchema, marketplaceListingUpdateSchema } from "@/lib/schemas";
import { housingListingUpdateSchema } from "@/lib/housing-schemas";

const read = (path: string) => readFileSync(path, "utf8");

describe("správa vlastního uživatelského obsahu", () => {
  it("nabízí přepnutí Vše a Moje ve všech čtyřech sekcích", () => {
    for (const source of ["components/community-feed.tsx", "components/marketplace-explorer.tsx", "components/housing-explorer.tsx", "app/partak/page.tsx"]) expect(read(source)).toContain("OwnerScopeTabs");
    const tabs = read("components/owner-scope-tabs.tsx");
    expect(tabs).toContain('"Vše"'); expect(tabs).toContain('"Moje"');
  });

  it("načítá vlastní aktivní i neaktivní obsah, ale ne smazané položky", () => {
    expect(read("app/api/community/posts/route.ts")).toContain('.neq("status", "deleted")');
    expect(read("lib/marketplace-server.ts")).toContain('row.status !== "deleted"');
    expect(read("app/api/buddy-posts/route.ts")).toContain('post.status !== "deleted"');
    expect(read("lib/housing-public.ts")).toContain('"archived"');
  });

  it("validuje úpravy a změny stavů", () => {
    expect(buddyPostUpdateSchema.safeParse({ title: "Kino večer", status: "arranged" }).success).toBe(true);
    expect(marketplaceListingUpdateSchema.safeParse({ action: "archive" }).success).toBe(true);
    expect(housingListingUpdateSchema.safeParse({ action: "archive", version: 1 }).success).toBe(true);
  });

  it("vlastnictví určuje serverová session a mazání parťáka je měkké", () => {
    for (const source of ["app/api/community/posts/[id]/route.ts", "app/api/marketplace/listings/[id]/route.ts", "app/api/housing/listings/[id]/route.ts", "app/api/buddy-posts/[id]/route.ts"]) expect(read(source)).toContain("getCurrentAccount");
    const buddy = read("app/api/buddy-posts/[id]/route.ts");
    expect(buddy).toContain('updateRecord("buddy_posts", id, { status: "deleted" })');
    expect(buddy).not.toContain('deleteRecord("buddy_posts"');
  });

  it("zachovává chat a označí odstraněný původní kontext", () => {
    expect(read("components/chat-thread.tsx")).toContain("Původní nabídka již není dostupná");
    expect(read("components/chat-inbox.tsx")).toContain("Původní nabídka již není dostupná");
    const migration = read("supabase/migrations/202609240001_owned_content_management.sql");
    expect(migration).not.toContain("chat_conversations");
  });

  it("používá přístupný potvrzovací dialog nad mobilní navigací", () => {
    const dialog = read("components/confirm-delete-dialog.tsx");
    expect(dialog).toContain('role="dialog"'); expect(dialog).toContain('aria-modal="true"'); expect(dialog).toContain("Zrušit"); expect(dialog).toContain("Smazat");
    expect(read("app/globals.css")).toContain(".owner-delete-layer");
  });

  it("upravuje návrh místa přes PATCH stejného ID a odstraní jen povolené stavy", () => {
    const dialog=read("components/place-suggestion-dialog.tsx");const route=read("app/api/place-suggestions/[id]/route.ts");const summary=read("components/account-content-summary.tsx");
    expect(dialog).toContain('method:submissionId?"PATCH":"POST"');
    expect(dialog).toContain("removePhotoIds");
    expect(route).toContain('["draft", "pending", "changes_requested"]');
    expect(route).toContain('.update(changes).eq("id", id).eq("author_id", result.account.id)');
    expect(route).not.toContain('insert({id');
    expect(route).toContain('["draft", "withdrawn"]');
    expect(summary).toContain("submission=${String(item.id)}");
  });

  it("sjednocuje povolené editace neveřejných stavů bez opětovného publikování", () => {
    const market=read("app/api/marketplace/listings/[id]/route.ts");const housing=read("app/api/housing/listings/[id]/route.ts");const community=read("app/api/community/posts/[id]/route.ts");
    expect(market).toContain('archived: ["update", "reopen"]');
    expect(market).toContain('rejected: ["update"]');
    expect(market).toContain('previous === "hidden"');
    expect(housing).toContain('hidden: ["update", "archive", "reopen", "renew"]');
    expect(housing).toContain('const preservedStatus = ["hidden", "occupied", "found", "archived", "expired"]');
    expect(community).toContain('["active", "hidden"]');
    expect(community).toContain('status: post.status === "hidden" ? "hidden" : "active"');
  });

  it("filtruje měkce smazaný obsah a nevystavuje nefunkční správu komentářů", () => {
    const account=read("app/api/account/content/route.ts");
    expect(account.match(/\.neq\("status","deleted"\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(account).toContain("comments:[]");
  });

  it("váže ruční návrhy brigád na session profil a nechává externí feed mimo správu", () => {
    const jobs=read("app/api/jobs/route.ts");const detail=read("app/api/jobs/[id]/route.ts");const ui=read("components/job-explorer.tsx");const migration=read("supabase/migrations/202609250007_owned_content_workflow_policies.sql");
    expect(jobs).toContain("author_id:account.id");
    expect(detail).toContain('.eq("author_id",account.id)');
    expect(detail).toContain('status:"pending"');
    expect(detail).toContain('status:"deleted"');
    expect(ui).toContain("Moje návrhy");
    expect(migration).toContain("submissions_author_status_idx");
    expect(detail).not.toContain("fajn-brigady");
  });

  it("nabízí správu vlastních komunitních akcí v kalendáři včetně obrázku", () => {
    expect(read("components/community-events-explorer.tsx")).toContain("OwnerScopeTabs");
    expect(read("app/api/community-events/route.ts")).toContain('source.searchParams.get("scope") === "mine"');
    const manager=read("components/community-event-manager.tsx");
    expect(manager).toContain("removeImage");expect(manager).toContain('type="file"');
  });
});
