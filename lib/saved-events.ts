export type SavedTargetType = "academic_event" | "community_event";
export type SavedSnapshot = { title: string; start: string; end?: string; url: string };
export type LocalSavedItem = { targetType: SavedTargetType; targetId: string; favorite: boolean; watched: boolean; reminderDays: Array<0 | 1 | 3 | 7>; snapshot: SavedSnapshot };

export const savedEventsStorageKey = "studenthub-saved-events-v1";
export const savedEventsChanged = "studenthub-saved-events-changed";

export function readSavedEvents(storage: Pick<Storage, "getItem"> = localStorage): LocalSavedItem[] {
  try {
    const parsed = JSON.parse(storage.getItem(savedEventsStorageKey) || "[]") as LocalSavedItem[];
    return Array.isArray(parsed) ? parsed.filter((item) => item && ["academic_event", "community_event"].includes(item.targetType) && typeof item.targetId === "string") : [];
  } catch { return []; }
}

export function writeSavedEvent(next: LocalSavedItem, storage: Pick<Storage, "getItem" | "setItem"> = localStorage) {
  const current = readSavedEvents(storage).filter((item) => !(item.targetType === next.targetType && item.targetId === next.targetId));
  if (next.favorite || next.watched) current.push(next);
  storage.setItem(savedEventsStorageKey, JSON.stringify(current));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(savedEventsChanged));
  return current;
}
