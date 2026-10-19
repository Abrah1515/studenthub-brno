export function createChatRealtimeTopic(scope: string) {
  const safeScope = scope.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "updates";
  return `studenthub-chat-${safeScope}-${crypto.randomUUID()}`;
}

// A joined WebSocket channel can precede the PostgreSQL subscription. Fetch
// once when the database confirms readiness, including after reconnect, so no
// message between initial HTTP load and subscription falls into that gap.
export function refreshChatAfterSubscribe(payload: { status?: string; extension?: string }, refresh: () => unknown) {
  if (payload.status === "ok" && payload.extension === "postgres_changes") void refresh();
}
