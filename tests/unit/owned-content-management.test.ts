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
});
