import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { fajnFeedConfig } from "@/lib/job-feed/config";
import { parseFajnXml } from "@/lib/job-feed/fajn-parser";
import { planFajnImport } from "@/lib/job-feed/reconcile";
import { formatJobReward } from "@/lib/job-rewards";

describe("bezpečný parser Fajn XML", () => {
  it("zpracuje více pridani, česká pole i slovenský fallback", async () => { const result = await parseFajnXml(await readFile("tests/fixtures/fajn-synthetic.xml")); expect(result.jobs).toHaveLength(2); expect(result.jobs[0]).toMatchObject({ externalId: "900001", title: "Podpora studentské laboratoře", field: "IT", salaryMin: 180, salaryMax: 220, salaryCurrency: "CZK", salaryUnit: "hour" }); expect(result.jobs[1].title).toBe("Pomoc pri podujatí"); });
  it("zpracuje jedinou položku bez předpokladu pole", async () => { const result = await parseFajnXml(`<inzeraty><pridani><id_inzeratu>1</id_inzeratu><titulek_cs>Jedna nabídka</titulek_cs><url_detail>https://www.fajn-brigady.cz/brigady/brno/1-test/</url_detail></pridani></inzeraty>`); expect(result.jobs).toHaveLength(1); });
  it("odstraní HTML, e-mail i telefon", async () => { const result = await parseFajnXml(await readFile("tests/fixtures/fajn-synthetic.xml")); expect(result.jobs[0].description).not.toMatch(/<strong>|test@example|777 111 222/); expect(result.jobs[0].description).toContain("kontakt odstraněn"); });
  it("odmítne DTD, poškozené XML, neplatné ID a cizí URL", async () => { await expect(parseFajnXml(`<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><inzeraty/>`)).rejects.toThrow(/zakázanou/); await expect(parseFajnXml(`<inzeraty><pridani>`)).rejects.toThrow(/platný/); const invalid = await parseFajnXml(`<inzeraty><pridani><id_inzeratu>x</id_inzeratu><titulek_cs>Chybná nabídka</titulek_cs><url_detail>https://evil.example/job</url_detail></pridani></inzeraty>`); expect(invalid).toMatchObject({ jobs: [], rejected: 1 }); });
  it("neplatnou mzdu nebo měnu nezobrazí jako nulu", async () => { const result = await parseFajnXml(`<inzeraty><pridani><id_inzeratu>2</id_inzeratu><titulek_cs>Bezpečná mzda</titulek_cs><mzda_od>abc</mzda_od><mzda_do>100</mzda_do><mzda_typ>1</mzda_typ><mzda_mena>99</mzda_mena><url_detail>https://www.inwork.cz/prace/2-test/</url_detail></pridani></inzeraty>`); expect(result.jobs[0].salaryMin).toBeUndefined(); expect(result.jobs[0].salaryCurrency).toBeUndefined(); expect(formatJobReward({})).toBe("Odměna neuvedena"); });
});

describe("idempotentní synchronizační plán", () => {
  it("opakovaný stejný import nevkládá duplicitu", async () => { const [job] = (await parseFajnXml(await readFile("tests/fixtures/fajn-synthetic.xml"))).jobs; const plan = planFajnImport([{ id: "db-1", external_id: job.externalId, source_hash: job.sourceHash, status: "approved" }], [job], "incremental"); expect(plan).toMatchObject({ inserts: [], updates: [], archiveIds: [] }); expect(plan.unchanged).toHaveLength(1); });
  it("změněný inzerát aktualizuje", async () => { const [job] = (await parseFajnXml(await readFile("tests/fixtures/fajn-synthetic.xml"))).jobs; const plan = planFajnImport([{ id: "db-1", external_id: job.externalId, source_hash: "0".repeat(64), status: "approved" }], [job], "incremental"); expect(plan.updates).toHaveLength(1); });
  it("chybějící nabídku v bezpečném režimu nearchivuje", () => { const existing = [{ id: "db-1", external_id: "1", source_hash: "0".repeat(64), status: "approved" }]; expect(planFajnImport(existing, [], "incremental").archiveIds).toEqual([]); expect(planFajnImport(existing, [], "full_snapshot").archiveIds).toEqual(["db-1"]); });
});

describe("aktivace konektoru", () => {
  it("vyžaduje flag, svolení a ostrou adresu a odmítá testovací XML", () => { const base = { FAJN_BRIGADY_FEED_ENABLED: "true", FAJN_BRIGADY_PERMISSION_CONFIRMED: "true" } as unknown as NodeJS.ProcessEnv; expect(fajnFeedConfig(base).enabled).toBe(false); expect(fajnFeedConfig({ ...base, FAJN_BRIGADY_FEED_URL: "https://media.fajnsprava.cz/exporty/boxy/vzor_detail.xml" }).enabled).toBe(false); expect(fajnFeedConfig({ ...base, FAJN_BRIGADY_FEED_URL: "https://media.fajnsprava.cz/exporty/boxy/production-secret.xml" }).enabled).toBe(true); });
});
