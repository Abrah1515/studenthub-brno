export type PlaceLiveCode = "no_queue" | "short_queue" | "long_queue" | "closed" | "many_seats" | "partly_occupied" | "almost_full";
export type PlaceLiveReport = { status: PlaceLiveCode; reportedAt: string; installationId: string; suspicious?: boolean; hidden?: boolean };
export type PlaceLiveSummary = { code: PlaceLiveCode | "unknown"; label: string; reportCount: number; lastUpdatedAt?: string; available: boolean };

export const placeLiveLabels: Record<PlaceLiveCode, string> = { no_queue: "Bez fronty", short_queue: "Krátká fronta", long_queue: "Dlouhá fronta", closed: "Zavřeno", many_seats: "Dost volných míst", partly_occupied: "Částečně obsazeno", almost_full: "Téměř plno" };

export function statusesForPlace(category: string): PlaceLiveCode[] {
  if (["Menza", "canteen"].includes(category)) return ["no_queue", "short_queue", "long_queue", "closed"];
  if (["Knihovna", "Studovna", "library", "study_room"].includes(category)) return ["many_seats", "partly_occupied", "almost_full", "closed"];
  return [];
}

export function summarizePlaceLiveReports(reports: PlaceLiveReport[], now = new Date()): PlaceLiveSummary {
  const current = reports.filter((report) => !report.hidden && !report.suspicious && now.getTime() - new Date(report.reportedAt).getTime() >= 0 && now.getTime() - new Date(report.reportedAt).getTime() <= 60 * 60 * 1000);
  const independent = [...new Map(current.sort((a, b) => b.reportedAt.localeCompare(a.reportedAt)).map((item) => [item.installationId, item])).values()];
  const unknown = { code: "unknown" as const, label: "Aktuální stav zatím neznáme", reportCount: independent.length, lastUpdatedAt: independent[0]?.reportedAt, available: false };
  if (independent.length < 2) return unknown;
  const weights = new Map<PlaceLiveCode, number>(); let total = 0;
  for (const report of independent) { const ageMinutes = (now.getTime() - new Date(report.reportedAt).getTime()) / 60_000; const weight = Math.max(.12, 1 - ageMinutes / 75); weights.set(report.status, (weights.get(report.status) || 0) + weight); total += weight; }
  const winner = [...weights].sort((a, b) => b[1] - a[1])[0]; if (!winner || winner[1] / total < .55) return unknown;
  return { code: winner[0], label: placeLiveLabels[winner[0]], reportCount: independent.length, lastUpdatedAt: independent[0]?.reportedAt, available: winner[0] !== "closed" && !["long_queue", "almost_full"].includes(winner[0]) };
}
