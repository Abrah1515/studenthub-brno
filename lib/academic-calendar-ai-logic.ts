import { foldSearchText } from "@/lib/search";
import { decideSourceConflict, type SourceRevision } from "@/lib/sources/conflict-resolution";

export function calendarDuplicateGroups(events: Record<string, unknown>[]) {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const event of events) {
    if (event.is_cancelled) continue;
    const key = [event.university_id, event.faculty_id, event.academic_year, event.semester, event.category, foldSearchText(String(event.title || ""))].join("|");
    groups.set(key, [...(groups.get(key) || []), event]);
  }
  return [...groups].filter(([, group]) => group.length > 1 && new Set(group.map((event) => String(event.source_id))).size > 1);
}

export function calendarConflictRecommendation(existing: SourceRevision, proposed: SourceRevision) {
  const priority = decideSourceConflict(existing, proposed);
  const recommendedAction = priority === "proposed"
    ? "Nově načtený oficiální zdroj má prokazatelně novější revizi. Ručně potvrdit opravu termínu."
    : priority === "existing"
      ? "Uložený oficiální zdroj má prokazatelně novější revizi. Nechat termín beze změny a prověřit starší zdroj."
      : "Pořadí oficiálních revizí nelze prokázat. Ponechat konflikt otevřený k ruční kontrole.";
  return { priority, recommendedAction };
}
