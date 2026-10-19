import { expect, it, vi } from 'vitest';
import { refreshChatAfterSubscribe } from '@/lib/chat-realtime';
it('catches messages between initial load and PostgreSQL readiness, also on reconnect', () => {
  const refresh = vi.fn();
  refreshChatAfterSubscribe({ status: 'ok', extension: 'broadcast' }, refresh);
  refreshChatAfterSubscribe({ status: 'error', extension: 'postgres_changes' }, refresh);
  expect(refresh).not.toHaveBeenCalled();
  refreshChatAfterSubscribe({ status: 'ok', extension: 'postgres_changes' }, refresh);
  expect(refresh).toHaveBeenCalledTimes(1);
  refreshChatAfterSubscribe({ status: 'ok', extension: 'postgres_changes' }, refresh);
  expect(refresh).toHaveBeenCalledTimes(2);
});
