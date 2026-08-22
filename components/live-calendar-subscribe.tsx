"use client";

import { CalendarSync, Copy, ExternalLink, RotateCcw } from "lucide-react";
import { useState } from "react";

type Scope = { cityId: string; universityId?: string; facultyId?: string; studyYear?: number; category?: string };
export function LiveCalendarSubscribe({ scope }: { scope: Scope }) {
  const [feed, setFeed] = useState<{ httpsUrl: string; webcalUrl: string } | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function create() { setBusy(true); setMessage(""); const response = await fetch("/api/calendar/subscriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(scope) }); const payload = await response.json().catch(() => ({})); setBusy(false); if (!response.ok) return setMessage(String(payload.message || "Odběr se nepodařilo vytvořit.")); setFeed(payload); setMessage("Živý odběr je připravený. Nové a změněné termíny se propíší automaticky."); }
  async function revoke() { if (!feed) return; const token = feed.httpsUrl.match(/\/feed\/([^/.]+)\.ics/)?.[1]; if (token) await fetch("/api/calendar/subscriptions", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }); setFeed(null); setMessage("Odběr byl zrušen. Z kalendářové aplikace jej případně odeberte také."); }
  if (!feed) return <><button className="button button-secondary" type="button" disabled={busy} onClick={create}><CalendarSync size={16} />{busy ? "Připravuji…" : "Odebírat živě"}</button>{message && <span className="sr-only" role="status">{message}</span>}</>;
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed.webcalUrl)}`; const outlook = `https://outlook.live.com/calendar/0/addcalendar?url=${encodeURIComponent(feed.httpsUrl)}&name=${encodeURIComponent("StudentHub Brno")}`;
  return <div className="live-calendar-links" role="status"><strong>Živý kalendář</strong><a className="button button-secondary" href={google} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />Google</a><a className="button button-secondary" href={feed.webcalUrl}><ExternalLink size={15} />Apple / aplikace</a><a className="button button-secondary" href={outlook} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />Outlook</a><button className="button button-secondary" onClick={() => navigator.clipboard.writeText(feed.httpsUrl)}><Copy size={15} />Kopírovat ICS</button><button className="button button-secondary" onClick={revoke}><RotateCcw size={15} />Zrušit</button><small>{message}</small></div>;
}
