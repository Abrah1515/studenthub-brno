import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('node:dns/promises', () => ({ lookup: vi.fn(async () => [{ address: '203.0.113.10', family: 4 }]) }));
import { fetchRegisteredSource } from '@/lib/sources/fetch-source';
import { contentSources } from '@/lib/sources/registry';
import { robotsAllowsPath } from '@/lib/sources/robots';
const source = contentSources.find(s => s.id === 'src-vut-fit')!;
afterEach(() => vi.unstubAllGlobals());
it.each([
  [200, 'text/html', '<html><script>crypto.subtle.digest()</script></html>', 'challenge', 'blocked'],
  [200, 'text/html', '<html>ordinary page</html>', 'robots_unavailable', 'needs_review'],
  [200, 'text/plain', '<html>ordinary page</html>', 'robots_unavailable', 'needs_review'],
  [200, 'application/json', '{"ok":true}', 'robots_unavailable', 'needs_review'],
  [503, 'text/plain', 'Unavailable', 'robots_unavailable', 'needs_review'],
  [403, 'text/plain', 'Forbidden', 'robots_unavailable', 'blocked'],
  [200, 'text/plain', 'User-agent: *\nDisallow: /', 'robots_disallowed', 'blocked'],
] as const)('refuses status %s mime %s safely', async (status, mime, body, code, state) => {
  const fetcher = vi.fn(async () => new Response(body, { status, headers: { 'content-type': mime, 'set-cookie': 'challenge=1' } }));
  vi.stubGlobal('fetch', fetcher);
  await expect(fetchRegisteredSource(source)).rejects.toMatchObject({ issue: { code, status: state } });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([404, 410, 200])('missing or valid policy permits content only after check (%s)', async status => {
  const fetcher = vi.fn(async (input: URL) => input.pathname === '/robots.txt'
    ? new Response(status === 200 ? 'User-agent: *\nDisallow: /captcha\nAllow: /' : 'Not found', { status, headers: { 'content-type': 'text/plain' } })
    : new Response('calendar', { headers: { 'content-type': 'text/html' } }));
  vi.stubGlobal('fetch', fetcher);
  await expect(fetchRegisteredSource(source)).resolves.toMatchObject({ status: 200 });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('follows only validated redirects and never forwards challenge cookies', async () => {
  const fetcher = vi.fn(async (input: URL, init: RequestInit) => {
    expect(init.redirect).toBe('manual'); expect(new Headers(init.headers).has('cookie')).toBe(false);
    if (input.pathname === '/robots.txt') return new Response(null, { status: 302, headers: { location: '/policy.txt' } });
    if (input.pathname === '/policy.txt') return new Response('User-agent: *\nAllow: /');
    return new Response('calendar');
  });
  vi.stubGlobal('fetch', fetcher);
  await expect(fetchRegisteredSource(source)).resolves.toMatchObject({ status: 200 });
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it('refuses redirect to unregistered domain before fetching it', async () => {
  const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://unregistered.test/robots.txt' } }));
  vi.stubGlobal('fetch', fetcher);
  await expect(fetchRegisteredSource(source)).rejects.toMatchObject({ issue: { code: 'robots_unavailable' } });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('reports timeout without fetching source', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('Timeout', 'AbortError'); }));
  await expect(fetchRegisteredSource(source)).rejects.toMatchObject({ issue: { code: 'robots_unavailable' } });
});
it('does not replay HTML cookie challenge on the document either', async () => {
  const fetcher = vi.fn(async (url: URL) => url.pathname === '/robots.txt' ? new Response('User-agent: *\nAllow: /') : new Response('<meta http-equiv="refresh" content="0">', { headers: { 'content-type': 'text/html', 'set-cookie': 'challenge=1' } }));
  vi.stubGlobal('fetch', fetcher);
  await expect(fetchRegisteredSource(source)).rejects.toMatchObject({ issue: { code: 'challenge', status: 'blocked' } });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('honours wildcard and end-anchored robots restrictions', () => {
  expect(robotsAllowsPath('/study/calendar.pdf', 'User-agent: *\nDisallow: /*.pdf$')).toBe(false);
  expect(robotsAllowsPath('/study/calendar.pdf?lang=cs', 'User-agent: *\nDisallow: /*.pdf$')).toBe(true);
  expect(robotsAllowsPath('/a/private/calendar', 'User-agent: *\nDisallow: /*/private/')).toBe(false);
});
