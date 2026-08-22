"use client";

import { useEffect, useState } from "react";
import { readSavedEvents, savedEventsChanged } from "@/lib/saved-events";
import { fetchWatcherState } from "@/lib/watcher-client";

export function WatcherBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const local = () => setCount(readSavedEvents().filter((item) => item.watched).length); local();
    fetchWatcherState().then((value) => { if (value) setCount(value.notifications.filter((item) => !item.read).length); }).catch(() => undefined);
    window.addEventListener(savedEventsChanged, local); return () => window.removeEventListener(savedEventsChanged, local);
  }, []);
  return count > 0 ? <span className="watcher-badge" aria-label={`${count} nových upozornění`}>{Math.min(count, 99)}</span> : null;
}
