export function createChatRealtimeTopic(scope: string) {
  const safeScope = scope.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "updates";
  return `studenthub-chat-${safeScope}-${crypto.randomUUID()}`;
}
