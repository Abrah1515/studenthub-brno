import { describe, expect, it } from "vitest";
import { recordOrderColumn } from "@/lib/data-store-order";

describe("řazení sdíleného datového úložiště", () => {
  it("používá skutečné časové sloupce tabulek bez created_at", () => {
    expect(recordOrderColumn("page_views")).toBe("viewed_at");
    expect(recordOrderColumn("link_checks")).toBe("checked_at");
    expect(recordOrderColumn("place_live_reports")).toBe("reported_at");
    expect(recordOrderColumn("academic_events")).toBe("created_at");
  });
});
