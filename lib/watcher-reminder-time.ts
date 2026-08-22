export type ReminderDay = 0 | 1 | 3 | 7;

function pragueDateKey(value: Date) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

export function dueReminderDay(startsAt: string, reminderDays: number[], now = new Date()): ReminderDay | undefined {
  const starts = new Date(startsAt);
  if (Number.isNaN(starts.getTime())) return undefined;
  const samePragueDay = pragueDateKey(starts) === pragueDateKey(now);
  if (starts.getTime() < now.getTime() && !samePragueDay) return undefined;
  const configured = [...new Set(reminderDays.filter((day): day is ReminderDay => [0, 1, 3, 7].includes(day)))].sort((a, b) => a - b);
  if (samePragueDay && configured.includes(0)) return 0;
  const remainingDays = Math.max(0, (starts.getTime() - now.getTime()) / 86_400_000);
  return configured.find((day) => day >= remainingDays);
}
