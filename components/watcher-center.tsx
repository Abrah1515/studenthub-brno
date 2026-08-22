"use client";

import { Bell, BellOff, CalendarDays, CheckCheck, Heart, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readSavedEvents, savedEventsChanged, writeSavedEvent, type LocalSavedItem } from "@/lib/saved-events";
import { fetchWatcherState, invalidateWatcherState } from "@/lib/watcher-client";

type NotificationItem = { id: string; kind: string; title: string; body: string; url: string; createdAt: string; read: boolean };
type ServerItem = LocalSavedItem & { id: string; available: boolean };

const categoryOptions = [
  ["course_registration", "Registrace předmětů"], ["course_enrollment", "Zápisy předmětů"],
  ["seminar_enrollment", "Seminární skupiny"], ["enrollment_changes", "Změny zápisů"],
  ["timetable_release", "Rozvrhy"], ["exam", "Zkouškové období"],
  ["final_exam_application", "Přihlášky ke státnicím"], ["final_exam", "Státní zkoušky"],
  ["thesis_deadline", "Závěrečné práce"], ["dean_rector_leave", "Děkanská a rektorská volna"],
] as const;

function base64Key(value: string) { const padding = "=".repeat((4 - value.length % 4) % 4); const bytes = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(bytes, (char) => char.charCodeAt(0)); }

export function WatcherCenter() {
  const [items, setItems] = useState<ServerItem[]>([]); const [notifications, setNotifications] = useState<NotificationItem[]>([]); const [loading, setLoading] = useState(true); const [message, setMessage] = useState(""); const [pushEnabled, setPushEnabled] = useState(false); const [pushBusy, setPushBusy] = useState(false); const [mutedCategories, setMutedCategories] = useState<string[]>([]); const [muteBusy, setMuteBusy] = useState(false);
  const load = useCallback(async (force = false) => {
    const local = readSavedEvents().map((item) => ({ ...item, id: `${item.targetType}:${item.targetId}`, available: true })); setItems(local);
    const payload = await fetchWatcherState(force);
    if (payload) {
      const serverItems = payload.items as ServerItem[];
      const serverKeys = new Set(serverItems.map((item) => `${item.targetType}:${item.targetId}`));
      setItems([...serverItems, ...local.filter((item) => !serverKeys.has(`${item.targetType}:${item.targetId}`))]);
      setNotifications(payload.notifications as NotificationItem[]);
      setMutedCategories(Array.isArray(payload.mutedCategories) ? payload.mutedCategories : []);
    }
    setLoading(false);
    if ("serviceWorker" in navigator) { const registration = await navigator.serviceWorker.ready.catch(() => null); setPushEnabled(Boolean(await registration?.pushManager.getSubscription())); }
  }, []);
  useEffect(() => { load(); const refresh = () => load(true); window.addEventListener(savedEventsChanged, refresh); return () => window.removeEventListener(savedEventsChanged, refresh); }, [load]);
  const upcoming = useMemo(() => [...items].filter((item) => item.favorite || item.watched).sort((a, b) => a.snapshot.start.localeCompare(b.snapshot.start)), [items]);
  async function update(item: ServerItem, changes: Partial<Pick<LocalSavedItem, "favorite" | "watched" | "reminderDays">>) {
    const next = { ...item, ...changes }; writeSavedEvent(next); setItems((current) => current.map((entry) => entry.targetId === item.targetId && entry.targetType === item.targetType ? next : entry).filter((entry) => entry.favorite || entry.watched));
    await fetch("/api/watcher", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetType: item.targetType, targetId: item.targetId, favorite: next.favorite, watched: next.watched, reminderDays: next.reminderDays, snapshot: next.snapshot }) }).catch(() => null); invalidateWatcherState();
  }
  async function enablePush() {
    setPushBusy(true); setMessage("");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error("Tento prohlížeč Web Push nepodporuje. Upozornění uvnitř StudentHubu zůstávají funkční.");
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY; if (!key) throw new Error("Push zatím čeká na bezpečné doplnění produkčního VAPID klíče. Upozornění uvnitř aplikace fungují dál.");
      const permission = await Notification.requestPermission(); if (permission !== "granted") throw new Error(permission === "denied" ? "Oznámení jsou v prohlížeči zamítnutá. Povolte je v nastavení webu a zkuste to znovu." : "Povolení oznámení nebylo dokončeno.");
      const registration = await navigator.serviceWorker.ready; const existing = await registration.pushManager.getSubscription(); const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64Key(key) });
      const response = await fetch("/api/push/subscription", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription.toJSON()) }); if (!response.ok) throw new Error("Push přihlášení se nepodařilo bezpečně uložit.");
      setPushEnabled(true); setMessage("Push upozornění jsou zapnutá.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Push upozornění se nepodařilo zapnout."); }
    finally { setPushBusy(false); }
  }
  async function disablePush() {
    setPushBusy(true); const registration = await navigator.serviceWorker.ready.catch(() => null); const subscription = await registration?.pushManager.getSubscription();
    if (subscription) { await fetch("/api/push/subscription", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => null); await subscription.unsubscribe(); }
    setPushEnabled(false); setPushBusy(false); setMessage("Push upozornění jsou vypnutá. Interní Hlídač zůstává aktivní.");
  }
  async function markRead(notification: NotificationItem) { await fetch("/api/watcher", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ notificationId: notification.id, read: true }) }); setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read: true } : item)); }
  async function toggleMutedCategory(category: string) {
    const next = mutedCategories.includes(category) ? mutedCategories.filter((item) => item !== category) : [...mutedCategories, category];
    setMutedCategories(next); setMuteBusy(true); setMessage("");
    const response = await fetch("/api/watcher", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ mutedCategories: next }) }).catch(() => null);
    if (!response?.ok) { setMutedCategories(mutedCategories); setMessage("Nastavení kategorií se nepodařilo uložit."); }
    else { invalidateWatcherState(); setMessage("Nastavení kategorií bylo uloženo pro toto zařízení."); }
    setMuteBusy(false);
  }
  return <div className="watcher-layout">
    <section className="watcher-settings"><div><span className="settings-icon"><Bell size={23} /></span><h2>Upozornění na tomto zařízení</h2><p>Oblíbené a sledování fungují bez registrace. Přesná poloha ani osobní údaje se pro Hlídač neukládají.</p></div><button className="button button-primary" disabled={pushBusy} onClick={pushEnabled ? disablePush : enablePush}>{pushBusy ? <Loader2 className="spin" size={17} /> : pushEnabled ? <BellOff size={17} /> : <Bell size={17} />}{pushEnabled ? "Vypnout push" : "Zapnout push"}</button><details className="watcher-mute-settings"><summary>Ztlumit běžné kategorie push upozornění</summary><p>Změny zůstanou v interním centru. Ztlumení vypne pouze automatický push pro vybrané kategorie.</p><div>{categoryOptions.map(([value, label]) => <label key={value}><input type="checkbox" checked={mutedCategories.includes(value)} disabled={muteBusy} onChange={() => toggleMutedCategory(value)} /><span>{label}</span></label>)}</div></details>{message && <p className="info-state" role="status">{message}</p>}</section>
    <section className="watcher-panel"><div className="section-head"><div><span className="section-icon"><Bell size={18} /></span><h2>Centrum upozornění</h2></div><span className="tag">{notifications.filter((item) => !item.read).length} nových</span></div>{notifications.length === 0 ? <div className="empty-state"><CheckCheck size={28} /><h3>Zatím bez upozornění</h3><p>Nové připomínky a důležité změny školních termínů se objeví tady.</p></div> : <div className="notification-list">{notifications.map((item) => <article className={item.read ? "" : "unread"} key={item.id}><div><strong>{item.title}</strong><p>{item.body}</p><small>{new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Prague" }).format(new Date(item.createdAt))}</small></div><Link className="button button-secondary" href={item.url} onClick={() => markRead(item)}>Otevřít</Link></article>)}</div>}</section>
    <section className="watcher-panel"><div className="section-head"><div><span className="section-icon"><Heart size={18} /></span><h2>Oblíbené a sledované</h2></div></div>{loading ? <div className="loading-inline"><Loader2 className="spin" />Načítám Hlídač…</div> : upcoming.length === 0 ? <div className="empty-state"><CalendarDays size={28} /><h3>Nic tu ještě není</h3><p>U školního termínu nebo akce použijte „Oblíbit“ nebo „Sledovat“.</p><Link className="button button-primary" href="/brno/kalendar">Otevřít kalendář</Link></div> : <div className="watcher-items">{upcoming.map((item) => <article key={`${item.targetType}:${item.targetId}`}><div><span className="result-labels"><span className="tag">{item.targetType === "academic_event" ? "Školní termín" : "Co se děje"}</span>{!item.available && <span className="tag"><TriangleAlert size={13} />Položka už není dostupná</span>}</span><h3>{item.snapshot.title}</h3><p>{new Intl.DateTimeFormat("cs-CZ", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Prague" }).format(new Date(item.snapshot.start))}</p></div><div className="watcher-item-controls">{item.available ? <Link className="button button-secondary" href={item.snapshot.url}>Otevřít</Link> : <span className="muted">Uložený náhled zůstává dostupný.</span>}<label><span>Připomenout</span><select aria-label={`Připomenutí pro ${item.snapshot.title}`} value={Math.min(...(item.reminderDays || [1]))} onChange={(event) => update(item, { reminderDays: [Number(event.target.value) as 0 | 1 | 3 | 7] })}><option value="7">týden předem</option><option value="3">3 dny předem</option><option value="1">den předem</option><option value="0">v den události</option></select></label><button className="button button-secondary" onClick={() => update(item, { favorite: false, watched: false })}>Odebrat</button></div></article>)}</div>}</section>
    <div className="trust-note"><ShieldCheck size={18} /><p>Zásadní změny relevantní pro vaši školu zůstávají v centru i bez push oprávnění. Vybrané běžné kategorie lze ztlumit výše.</p></div>
  </div>;
}
