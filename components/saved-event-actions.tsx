"use client";

import { Bell, Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { readSavedEvents, savedEventsChanged, writeSavedEvent, type SavedSnapshot, type SavedTargetType } from "@/lib/saved-events";
import { useStudentPreference } from "@/lib/client-preferences";

export function SavedEventActions({ targetType, targetId, snapshot }: { targetType: SavedTargetType; targetId: string; snapshot: SavedSnapshot }) {
  const preference = useStudentPreference();
  const [state, setState] = useState({ favorite: false, watched: false }); const [notice, setNotice] = useState("");
  useEffect(() => {
    const refresh = () => { const item = readSavedEvents().find((entry) => entry.targetType === targetType && entry.targetId === targetId); setState({ favorite: Boolean(item?.favorite), watched: Boolean(item?.watched) }); };
    refresh(); window.addEventListener(savedEventsChanged, refresh); return () => window.removeEventListener(savedEventsChanged, refresh);
  }, [targetId, targetType]);
  async function change(kind: "favorite" | "watched") {
    const next = { ...state, [kind]: !state[kind] }; setState(next);
    const item = { targetType, targetId, ...next, reminderDays: [7, 3, 1, 0] as Array<7 | 3 | 1 | 0>, snapshot };
    writeSavedEvent(item);
    const response = await fetch("/api/watcher", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...item, preference: { cityId: preference.cityId || "brno", universityId: preference.universityId, facultyId: preference.facultyId, studyYear: preference.studyYear } }) }).catch(() => null);
    setNotice(response?.ok ? (kind === "favorite" ? (next.favorite ? "Uloženo do oblíbených." : "Odebráno z oblíbených.") : (next.watched ? "Hlídač je zapnutý." : "Sledování je vypnuté.")) : "Uloženo v tomto zařízení; synchronizace se zkusí znovu později.");
    window.setTimeout(() => setNotice(""), 2500);
  }
  return <div className="saved-event-actions"><button className={`button button-secondary ${state.favorite ? "is-active" : ""}`} type="button" aria-pressed={state.favorite} onClick={() => change("favorite")}><Heart size={16} fill={state.favorite ? "currentColor" : "none"} />{state.favorite ? "V oblíbených" : "Oblíbit"}</button><button className={`button button-secondary ${state.watched ? "is-active" : ""}`} type="button" aria-pressed={state.watched} onClick={() => change("watched")}><Bell size={16} fill={state.watched ? "currentColor" : "none"} />{state.watched ? "Sleduji" : "Sledovat"}</button>{notice && <span className="sr-only" role="status">{notice}</span>}</div>;
}
