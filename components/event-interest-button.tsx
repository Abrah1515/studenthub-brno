"use client";

import { Users } from "lucide-react";
import { useEffect, useState } from "react";

const storageKey = "studenthub-event-interests-v1";
function stored() { try { const value = JSON.parse(localStorage.getItem(storageKey) || "[]"); return Array.isArray(value) ? value as string[] : []; } catch { return []; } }
export function EventInterestButton({ eventId, initialCount = 0, onCount }: { eventId: string; initialCount?: number; onCount?: (count: number, growth: number) => void }) {
  const [interested, setInterested] = useState(false); const [count, setCount] = useState(initialCount); const [busy, setBusy] = useState(false);
  useEffect(() => setInterested(stored().includes(eventId)), [eventId]);
  async function toggle() { const next = !interested; setInterested(next); setCount((value) => Math.max(0, value + (next ? 1 : -1))); setBusy(true); const values = stored().filter((id) => id !== eventId); if (next) values.push(eventId); localStorage.setItem(storageKey, JSON.stringify(values)); const response = await fetch(`/api/community-events/${eventId}/interest`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ interested: next }) }).catch(() => null); if (response?.ok) { const payload = await response.json(); setCount(payload.count); onCount?.(payload.count, payload.growth); } setBusy(false); }
  return <button type="button" className={`button button-secondary ${interested ? "is-active" : ""}`} aria-pressed={interested} disabled={busy} onClick={toggle}><Users size={16} fill={interested ? "currentColor" : "none"} />{interested ? "Mám zájem" : "Mám zájem"}<span aria-label={`${count} zájemců`}>{count}</span></button>;
}
