"use client";

import { useEffect, useState } from "react";
import { readSavedEvents, savedEventsChanged } from "@/lib/saved-events";

export function WatcherBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const local = () => setCount(readSavedEvents().filter((item) => item.watched).length); local();
    fetch("/api/watcher", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((value) => { if (value) setCount(value.notifications.filter((item: { read: boolean }) => !item.read).length); }).catch(() => undefined);
    window.addEventListener(savedEventsChanged, local); return () => window.removeEventListener(savedEventsChanged, local);
  }, []);
  return count > 0 ? <span className="watcher-badge" aria-label={`${count} nových upozornění`}>{Math.min(count, 99)}</span> : null;
}
