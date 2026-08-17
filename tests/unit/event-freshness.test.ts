import { describe, expect, it } from "vitest";
import { eventFreshness } from "@/lib/event-freshness";

describe("čerstvost zdroje akademické události", () => {
  const now = new Date("2026-08-12T10:00:00Z");
  it("mluví výslovně o zdroji, nikoli o průběhu události", () => expect(eventFreshness("2026-08-12T01:30:00Z", now)).toEqual({ label: "Zdroj nedávno ověřen", tone: "fresh" }));
  it("rozliší čekání na kontrolu a starší ověření zdroje", () => { expect(eventFreshness("2026-08-10T10:00:00Z", now)).toEqual({ label: "Zdroj čeká na další kontrolu", tone: "waiting" }); expect(eventFreshness("2026-08-08T10:00:00Z", now)).toEqual({ label: "Zdroj ověřen před delší dobou", tone: "stale" }); });
});
