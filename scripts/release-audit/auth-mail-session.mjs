// Opt-in, interactive production mail test. All credentials and email links
// stay in process memory; terminal echo is disabled before accepting commands.
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
import { readEnvironment } from './environment.mjs';

if (process.env.CONFIRM_QA_PRODUCTION !== 'studenthubapp.cz' || !process.stdin.isTTY) throw Error('Explicit production confirmation and private TTY input required');
process.stdin.setRawMode(true);
const env = await readEnvironment();
const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext();
const page = await context.newPage();
const base = 'https://studenthubapp.cz';
const input = createInterface({ input: process.stdin, terminal: false });
let email, userId, password = `Qa1!${randomUUID()}`;
const assert = (value, code) => { if (!value) throw Error(code); };
async function api(path, body, method = 'POST') {
  return page.evaluate(async ({ path, body, method }) => {
    const r = await fetch(path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  }, { path, body, method });
}
async function cleanup() {
  if (!userId && email) {
    const users = await service.auth.admin.listUsers({ perPage: 1000 });
    assert(!users.error, 'cleanup_inventory_failed');
    userId = users.data.users.find(u => u.email === email)?.id;
  }
  if (userId) {
    const removed = await service.auth.admin.deleteUser(userId);
    assert(!removed.error, 'cleanup_account_failed');
    const profile = await service.from('profiles').select('id', { count: 'exact', head: true }).eq('id', userId);
    assert(!profile.error && profile.count === 0, 'cleanup_profile_failed');
    userId = null; email = null;
  }
  return { cleanup: 'PASS' };
}
async function run(command) {
  if (command.op === 'signup') {
    assert(!email && /^[^\s@]+\+studenthub-test-[^\s@]+@gmail\.com$/i.test(command.email), 'invalid_test_recipient');
    const users = await service.auth.admin.listUsers({ perPage: 1000 });
    assert(!users.error && !users.data.users.some(u => u.email === command.email), 'test_account_already_exists');
    email = command.email;
    await page.goto(`${base}/ucet/prihlaseni`, { waitUntil: 'domcontentloaded' });
    const r = await api('/api/auth/signup', { email, password, next: '/brno/nastaveni' });
    const created = await service.auth.admin.listUsers({ perPage: 1000 });
    userId = created.data?.users.find(u => u.email === email)?.id;
    return { op: command.op, http: r.status, message: r.data.message, requiresConfirmation: r.data.requiresEmailConfirmation, testAccountCreated: Boolean(userId) };
  }
  if (command.op === 'resend') {
    const r = await api('/api/auth/resend', { email, next: '/brno/nastaveni' });
    return { op: command.op, http: r.status, message: r.data.message };
  }
  if (command.op === 'follow') {
    const link = new URL(command.url), project = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
    assert(link.protocol === 'https:' && link.origin === project.origin && link.pathname === '/auth/v1/verify', 'untrusted_email_link');
    const redirect = new URL(link.searchParams.get('redirect_to'));
    assert(redirect.origin === base && redirect.pathname === '/auth/callback', 'untrusted_callback');
    try { await page.goto(link.href, { waitUntil: 'domcontentloaded' }); } catch { throw Error('callback_navigation_failed'); }
    const destination = new URL(page.url());
    const me = await api('/api/auth/me', undefined, 'GET');
    return { op: command.op, path: destination.pathname, callbackError: destination.searchParams.get('error'), signedIn: Boolean(me.data.user), profileExists: Boolean(me.data.profile), role: me.data.profile?.role || null };
  }
  if (command.op === 'recover') {
    const out = await api('/api/auth/logout'); assert(out.status === 200, 'logout_failed');
    const r = await api('/api/auth/recover', { email });
    return { op: command.op, http: r.status, message: r.data.message };
  }
  if (command.op === 'reset') {
    const nextPassword = `Qa2!${randomUUID()}`;
    const updated = await api('/api/auth/update-password', { password: nextPassword });
    assert(updated.status === 200, 'password_update_failed');
    const reused = await api('/api/auth/update-password', { password: `Qa3!${randomUUID()}` });
    await api('/api/auth/logout');
    const old = await api('/api/auth/password', { email, password });
    const fresh = await api('/api/auth/password', { email, password: nextPassword }); password = nextPassword;
    return { op: command.op, updateHttp: updated.status, reusedIntentHttp: reused.status, oldPasswordHttp: old.status, newPasswordHttp: fresh.status };
  }
  if (command.op === 'cleanup') { const result = await cleanup(); input.close(); return result; }
  throw Error('unknown_command');
}
console.log(JSON.stringify({ ready: true, inputEchoDisabled: true }));
try {
  for await (const line of input) {
    try { console.log(JSON.stringify(await run(JSON.parse(line)))); }
    catch (error) { console.log(JSON.stringify({ status: 'FAIL', code: /^[a-z_]+$/.test(error.message) ? error.message : 'operation_failed_redacted' })); }
  }
} finally {
  try { if (email) console.log(JSON.stringify(await cleanup())); } finally { await browser.close(); process.stdin.setRawMode(false); }
}
