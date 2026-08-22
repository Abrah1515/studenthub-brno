import { describe, expect, it } from "vitest";
import { automaticPushIsMuted } from "@/lib/push-preferences";
import { watcherMutedCategoriesSchema } from "@/lib/schemas";

describe("nastavení kategorií Hlídače", () => {
  it("ztlumí jen automatický push změny vybrané školní kategorie", () => {
    const event = [{ id: "event-1", category: "exam" }];
    const installation = { muted_categories: ["exam"] };
    expect(automaticPushIsMuted({ kind: "academic_change", target_type: "academic_event", target_id: "event-1" }, installation, event)).toBe(true);
    expect(automaticPushIsMuted({ kind: "watch_reminder", target_type: "academic_event", target_id: "event-1" }, installation, event)).toBe(false);
    expect(automaticPushIsMuted({ kind: "academic_change", target_type: "academic_event", target_id: "event-2" }, installation, event)).toBe(false);
  });

  it("odmítne neznámou kategorii a přijme unikátní platné kategorie", () => {
    expect(watcherMutedCategoriesSchema.safeParse({ mutedCategories: ["exam", "thesis_deadline"] }).success).toBe(true);
    expect(watcherMutedCategoriesSchema.safeParse({ mutedCategories: ["marketing"] }).success).toBe(false);
  });
});
