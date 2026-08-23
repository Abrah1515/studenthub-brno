import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { fajnBenefits, fajnEducation, fajnPositions, fajnSuitability } from "@/lib/job-feed/catalogs";
import { fajnFeedConfig } from "@/lib/job-feed/config";
import { parseFajnXml, publicJobText } from "@/lib/job-feed/fajn-parser";
import { effectiveFajnImportMode, planFajnImport } from "@/lib/job-feed/reconcile";
import { formatJobReward } from "@/lib/job-rewards";

function item(fields: string) {
  return `<inzeraty><pridani><id_sekce>1</id_sekce><id_inzeratu>1</id_inzeratu><titulek_cs>Jedna nabídka</titulek_cs><id_statu>1</id_statu><adresa_pracoviste_id_mesta>582786</adresa_pracoviste_id_mesta><url_detail>https://www.fajn-brigady.cz/brigady/brno/1-test/</url_detail>${fields}</pridani></inzeraty>`;
}

describe("bezpečný parser Fajn XML", () => {
  it("zpracuje více pridani, česká pole i slovenský fallback", async () => {
    const result = await parseFajnXml(await readFile("tests/fixtures/fajn-synthetic.xml"));
    expect(result).toMatchObject({ total: 2, rejected: 0 }); expect(result.jobs).toHaveLength(2);
    expect(result.jobs[0]).toMatchObject({ externalId: "900001", title: "Podpora studentské laboratoře", field: "IT", workType: "Brigáda", salaryMin: 180, salaryMax: 220, salaryCurrency: "CZK", salaryUnit: "hour", positionLabel: "Programátor, webmaster, kodér" });
    expect(result.jobs[1]).toMatchObject({ title: "Pomoc pri podujatí", location: "Brno a okolí", salaryUnit: "agreement" });
  });

  it("na anonymizovaném tvaru oficiálního testu nic nepublikuje", async () => {
    const result = await parseFajnXml(await readFile("tests/fixtures/fajn-official-shape.xml"));
    expect(result).toMatchObject({ total: 3, jobs: [], rejected: 3 });
    expect(result.rejections.map((entry) => entry.code)).toEqual(["outside_brno", "wrong_section", "missing_title"]);
  });

  it("zpracuje jedinou položku a chybějící volitelné hodnoty", async () => {
    const result = await parseFajnXml(item("")); expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({ description: "", company: undefined, positionsCount: undefined, workload: undefined, location: "Brno" });
  });

  it("odstraní HTML, skript, e-mail i telefon a pole emaily ignoruje", async () => {
    const xml = item(`<popis_cs>&lt;script&gt;alert(1)&lt;/script&gt;&lt;strong&gt;Text&lt;/strong&gt; test@example.invalid +420 777 111 222</popis_cs><emaily><h>secret@example.invalid</h></emaily>`);
    const result = await parseFajnXml(xml); expect(result.jobs[0].description).toContain("Text");
    expect(result.jobs[0].description).not.toMatch(/script|alert|test@example|777 111|secret@example/); expect(result.jobs[0].description).toContain("kontakt odstraněn");
    expect(publicJobText("Ahoj foo@example.cz")).toBe("Ahoj [kontakt odstraněn]");
  });

  it("odmítne DTD, entity, poškozené XML a nesprávný kořen", async () => {
    await expect(parseFajnXml(`<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><inzeraty/>`)).rejects.toThrow(/zakázanou/);
    await expect(parseFajnXml(`<inzeraty><pridani>`)).rejects.toThrow(/platný/);
    await expect(parseFajnXml(`<nabidky/>`)).rejects.toThrow(/kořen/);
  });

  it("odmítne neplatné ID a URL mimo allowlist", async () => {
    const invalidId = await parseFajnXml(item("").replace("<id_inzeratu>1", "<id_inzeratu>x")); expect(invalidId.rejections[0].code).toBe("invalid_id");
    const invalidUrl = await parseFajnXml(item("").replace("https://www.fajn-brigady.cz/brigady/brno/1-test/", "https://evil.example/job")); expect(invalidUrl.rejections[0].code).toBe("invalid_url");
    const invalidPort = await parseFajnXml(item("").replace("https://www.fajn-brigady.cz/", "https://www.fajn-brigady.cz:8443/")); expect(invalidPort.rejections[0].code).toBe("invalid_url");
  });

  it("publikuje pouze sekci brigád", async () => {
    const result = await parseFajnXml(item("").replace("<id_sekce>1", "<id_sekce>3")); expect(result.jobs).toEqual([]); expect(result.rejections[0].code).toBe("wrong_section");
  });

  it("nepřekřtí cizí nebo neověřenou lokalitu na Brno", async () => {
    const foreign = await parseFajnXml(item("").replace("<id_statu>1", "<id_statu>2")); expect(foreign.rejections[0].code).toBe("outside_brno");
    const outside = await parseFajnXml(item("").replace("582786", "566985")); expect(outside.rejections[0].code).toBe("outside_brno");
    const unknown = await parseFajnXml(item("").replace("<id_statu>1</id_statu><adresa_pracoviste_id_mesta>582786</adresa_pracoviste_id_mesta>", "<id_statu>7</id_statu>")); expect(unknown.rejections[0].code).toBe("unverified_location");
    const approximate = await parseFajnXml(item("").replace("<adresa_pracoviste_id_mesta>582786</adresa_pracoviste_id_mesta>", "")); expect(approximate.jobs[0].location).toBe("Brno a okolí");
    const address = await parseFajnXml(item(`<adresa_pracoviste_adresa>Brno-střed</adresa_pracoviste_adresa>`).replace("582786", "999999")); expect(address.jobs[0].location).toBe("Brno-střed");
  });

  it.each([
    ["1", "hour"], ["2", "month"], ["28", "day"], ["29", "agreement"], ["30", "fixed"], ["31", "volunteer"],
  ])("mapuje oficiální typ mzdy %s", async (code, expected) => {
    const amount = ["29", "31"].includes(code) ? "" : `<mzda_od>180</mzda_od>`;
    const result = await parseFajnXml(item(`${amount}<mzda_typ>${code}</mzda_typ><mzda_mena>1</mzda_mena>`)); expect(result.jobs[0].salaryUnit).toBe(expected);
  });

  it.each([["1", "CZK"], ["2", "EUR"], ["3", "USD"], ["4", "GBP"]])("mapuje oficiální měnu %s", async (code, expected) => {
    const result = await parseFajnXml(item(`<mzda_od>180</mzda_od><mzda_typ>1</mzda_typ><mzda_mena>${code}</mzda_mena>`)); expect(result.jobs[0].salaryCurrency).toBe(expected);
  });

  it("neplatnou, jednostrannou nebo obrácenou mzdu nezobrazí jako nulu", async () => {
    for (const fields of [
      `<mzda_od>abc</mzda_od><mzda_typ>1</mzda_typ><mzda_mena>1</mzda_mena>`,
      `<mzda_do>200</mzda_do><mzda_typ>1</mzda_typ><mzda_mena>1</mzda_mena>`,
      `<mzda_od>220</mzda_od><mzda_do>180</mzda_do><mzda_typ>1</mzda_typ><mzda_mena>1</mzda_mena>`,
      `<mzda_od>180</mzda_od><mzda_typ>99</mzda_typ><mzda_mena>99</mzda_mena>`,
    ]) {
      const result = await parseFajnXml(item(fields)); expect(result.jobs[0].salaryMin).toBeUndefined(); expect(result.jobs[0].salaryCurrency).toBeUndefined();
    }
    expect(formatJobReward({})).toBe("Odměna neuvedena");
  });

  it("používá oficiální číselníky pozic, benefitů, vhodnosti a vzdělání", async () => {
    expect(fajnPositions["145"]).toMatchObject({ field: "IT", label: "Programátor, webmaster, kodér" }); expect(fajnPositions["370"].field).toBe("Elektro"); expect(fajnPositions["1"].field).toBe("Administrativa"); expect(fajnPositions["497"].field).toBe("Gastro");
    expect(fajnBenefits["3"]).toBe("Práce z domova"); expect(fajnSuitability["8"]).toBe("Od 15 let"); expect(fajnEducation["6"]).toBe("Vysokoškolské");
    const result = await parseFajnXml(item(`<id_pozice>370</id_pozice><benefity><h>3</h></benefity><vhodne_pro><h>8</h></vhodne_pro><id_min_vzdelani>6</id_min_vzdelani><uvazek><h>2</h></uvazek>`));
    expect(result.jobs[0]).toMatchObject({ field: "Elektro", workload: "Zkrácený úvazek", benefitCodes: ["3"], suitabilityCodes: ["8"], minimumEducationExternalId: "6" });
  });

  it("neznámé číselníky bezpečně vynechá a ohlásí", async () => {
    const result = await parseFajnXml(item(`<id_pozice>999</id_pozice><benefity><h>99</h></benefity><uvazek><h>99</h></uvazek>`)); expect(result.jobs[0]).toMatchObject({ field: "Ostatní", benefitCodes: [], workloadCodes: [] }); expect(result.warnings.join(" ")).toMatch(/neznám/);
  });

  it("duplicitní externí ID započítá pouze jednou", async () => {
    const one = item("").replace("<inzeraty>", "").replace("</inzeraty>", ""); const result = await parseFajnXml(`<inzeraty>${one}${one}</inzeraty>`); expect(result.jobs).toHaveLength(1); expect(result.rejections[0].code).toBe("duplicate_external_id");
  });

  it("jedna vadná položka nezastaví bezpečnou položku ve stejném feedu", async () => {
    const valid = item("").replace("<inzeraty>", "").replace("</inzeraty>", "");
    const invalid = valid.replace("<id_inzeratu>1", "<id_inzeratu>2").replace("<titulek_cs>Jedna nabídka", "<titulek_cs>x");
    const result = await parseFajnXml(`<inzeraty>${invalid}${valid}</inzeraty>`); expect(result.jobs).toHaveLength(1); expect(result).toMatchObject({ total: 2, rejected: 1 });
  });
});

describe("idempotentní synchronizační plán", () => {
  it("opakovaný stejný import nevkládá duplicitu", async () => {
    const [job] = (await parseFajnXml(await readFile("tests/fixtures/fajn-synthetic.xml"))).jobs;
    const plan = planFajnImport([{ id: "db-1", external_id: job.externalId, source_hash: job.sourceHash, status: "approved" }], [job], "incremental");
    expect(plan).toMatchObject({ inserts: [], updates: [], archiveIds: [], missing: [] }); expect(plan.unchanged).toHaveLength(1);
  });
  it("změněný nebo archivovaný inzerát aktualizuje a reaktivuje", async () => {
    const [job] = (await parseFajnXml(await readFile("tests/fixtures/fajn-synthetic.xml"))).jobs;
    expect(planFajnImport([{ id: "db-1", external_id: job.externalId, source_hash: "0".repeat(64), status: "approved" }], [job], "incremental").updates).toHaveLength(1);
    expect(planFajnImport([{ id: "db-1", external_id: job.externalId, source_hash: job.sourceHash, status: "archived" }], [job], "incremental").updates).toHaveLength(1);
  });
  it("inkrementální feed nearchivuje a úplný snapshot čeká na třetí chybění", () => {
    const existing = [{ id: "db-1", external_id: "1", source_hash: "0".repeat(64), status: "approved", missing_from_feed_runs: 0 }];
    expect(planFajnImport(existing, [], "incremental").archiveIds).toEqual([]);
    expect(planFajnImport(existing, [], "full_snapshot")).toMatchObject({ archiveIds: [], missing: [{ id: "db-1", count: 1 }] });
    expect(planFajnImport([{ ...existing[0], missing_from_feed_runs: 2 }], [], "full_snapshot").archiveIds).toEqual(["db-1"]);
  });
  it("neúplný nebo částečně odmítnutý snapshot přepne do bezpečného inkrementálního režimu", () => {
    const existing = Array.from({ length: 10 }, (_, index) => ({ id: String(index), external_id: String(index), source_hash: null, status: "approved" }));
    expect(effectiveFajnImportMode(existing, 5, 0, "full_snapshot")).toBe("incremental");
    expect(effectiveFajnImportMode(existing, 8, 1, "full_snapshot")).toBe("incremental");
    expect(effectiveFajnImportMode(existing, 6, 0, "full_snapshot")).toBe("full_snapshot");
  });
});

describe("aktivace konektoru", () => {
  it("vyžaduje flag, svolení a ostrou adresu a odmítá všechny varianty testovacího XML", () => {
    const base = { FAJN_BRIGADY_FEED_ENABLED: "true", FAJN_BRIGADY_PERMISSION_CONFIRMED: "true" } as unknown as NodeJS.ProcessEnv;
    expect(fajnFeedConfig(base)).toMatchObject({ enabled: false, statusReason: "Čeká na ostrý XML feed." });
    expect(fajnFeedConfig({ ...base, FAJN_BRIGADY_FEED_URL: "https://media.fajnsprava.cz/exporty/boxy/VZOR_DETAIL.XML?x=1" }).enabled).toBe(false);
    expect(fajnFeedConfig({ ...base, FAJN_BRIGADY_FEED_URL: "https://media.fajnsprava.cz/exporty/boxy/production-secret.xml" }).enabled).toBe(true);
  });
});
