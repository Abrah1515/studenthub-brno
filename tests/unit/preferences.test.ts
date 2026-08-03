// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { defaultPreference, legacyPreferenceKey, preferenceKey, readPreference, resetPreference, savePreference } from "@/lib/client-preferences";

describe("preference města", () => {
  beforeEach(() => { const values = new Map<string, string>(); const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, String(value)), removeItem: (key: string) => values.delete(key), clear: () => values.clear(), key: (index: number) => [...values.keys()][index] ?? null, get length() { return values.size; } }; Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true }); Object.defineProperty(window, "localStorage", { value: storage, configurable: true }); });
  it("používá Brno jako bezpečné výchozí město", () => { expect(readPreference()).toEqual(defaultPreference); expect(defaultPreference.cityId).toBe("brno"); expect(defaultPreference.version).toBe(2); });
  it("automaticky migruje v1 bez ztráty školy", () => { localStorage.setItem(legacyPreferenceKey, JSON.stringify({ universityId: "vut", facultyId: "vut-fekt", completed: true })); const value = readPreference(); expect(value).toMatchObject({ version: 2, cityId: "brno", universityId: "vut", facultyId: "vut-fekt", campusId: null, completed: true }); expect(localStorage.getItem(legacyPreferenceKey)).toBeNull(); expect(localStorage.getItem(preferenceKey)).toContain('"version":2'); });
  it("reset vrací výchozí město a všechny školy", () => { savePreference({ cityId: "brno", universityId: "muni", campusId: "brno-muni-bohunice", completed: true }); resetPreference(); expect(readPreference()).toEqual(defaultPreference); });
  it("při změně školy odstraní fakultu patřící jiné škole", () => { savePreference({ universityId: "muni", facultyId: "muni-fi", completed: true }); const next = savePreference({ universityId: "vut" }); expect(next).toMatchObject({ universityId: "vut", facultyId: null }); expect(readPreference().facultyId).toBeNull(); });
  it("po obnovení zachová stabilní ID platné fakulty", () => { savePreference({ universityId: "mendelu", facultyId: "mendelu-pef", completed: true }); expect(readPreference()).toMatchObject({ universityId: "mendelu", facultyId: "mendelu-pef" }); });
});
