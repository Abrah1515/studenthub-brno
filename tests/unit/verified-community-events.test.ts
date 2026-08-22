import { beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({
  createServiceClient: vi.fn(),
  isSupabaseConfigured: vi.fn(() => false),
}));

let eventSourceContainsTitle: (content: string, title: string) => boolean;
let unsafeSourceResponseReason: (finalUrl: string, content: string) => string;

beforeAll(async () => {
  ({ eventSourceContainsTitle, unsafeSourceResponseReason } = await import("@/lib/verified-community-events"));
});

describe("ověřování veřejných komunitních akcí", () => {
  it("rozpozná název akce i bez diakritiky", () => {
    expect(eventSourceContainsTitle("<h1>Noc vedy 2026 v Brne</h1>", "Noc vědy 2026")).toBe(true);
  });

  it("nepovažuje ochrannou stránku za potvrzení akce", () => {
    expect(eventSourceContainsTitle("<title>Checking your browser</title><p>Turnstile challenge</p>", "Festival vědy Brno 2026")).toBe(false);
    expect(unsafeSourceResponseReason("https://example.cz/turnstile.php", "<html>".padEnd(700, "x"))).toMatch(/ochrannou/);
    expect(unsafeSourceResponseReason("https://example.cz/akce", "<title>Checking your browser</title>".padEnd(700, "x"))).toMatch(/ochrannou/);
  });

  it("vyžaduje více než jeden významový token", () => {
    expect(eventSourceContainsTitle("Program MUNI", "MUNI")).toBe(false);
  });

  it("omezuje automatické kontroly přibližně na devítihodinový interval", () => {
    expect(fs.readFileSync("lib/verified-community-events.ts", "utf8")).toContain('.lt("updated_at", cutoff)');
  });

  it("blokuje neúplný výsledek, aby nemohl zvýšit počet chybějících výskytů", () => {
    expect(unsafeSourceResponseReason("https://example.cz/akce", "příliš krátké")).toMatch(/příliš krátký/);
    expect(unsafeSourceResponseReason("https://example.cz/akce", "x".repeat(3_000_001))).toMatch(/nebyl porovnán celý/);
  });
});
