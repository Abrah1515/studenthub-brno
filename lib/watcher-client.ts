"use client";

export type WatcherClientState = {
  items: unknown[];
  notifications: Array<{ read: boolean }>;
  mutedCategories: string[];
};

let request: Promise<WatcherClientState | null> | null = null;
let requestedAt = 0;

// Navigace obsahuje více vizuálních instancí odznaku. Sdílený požadavek brání
// souběžnému založení několika anonymních instalací před uložením httpOnly cookie.
export function fetchWatcherState(force = false) {
  const now = Date.now();
  if (force || !request || now - requestedAt > 1_500) {
    requestedAt = now;
    request = fetch("/api/watcher", { cache: "no-store" }).then((response) => response.ok ? response.json() as Promise<WatcherClientState> : null).catch(() => null);
  }
  return request;
}

export function invalidateWatcherState() { request = null; requestedAt = 0; }
