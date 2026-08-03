import type { NormalizedEvent, SourceMonitoringMode } from "@/lib/sources/types";

export function partitionEventsForMonitoring(mode: SourceMonitoringMode, events: NormalizedEvent[]) {
  const publishable = mode === "automatic_publish" ? events.filter((event) => event.status === "approved" && event.confidence >= 0.9) : [];
  const review = mode === "automatic_publish" ? events.filter((event) => !publishable.includes(event)) : events;
  return { publishable, review };
}

export function sourceRunMayArchive(mode: SourceMonitoringMode, values: { publishableCount: number; reviewCount: number; warningCount: number; blocked: boolean }) {
  return mode === "automatic_publish" && !values.blocked && values.publishableCount > 0 && values.reviewCount === 0 && values.warningCount === 0;
}
