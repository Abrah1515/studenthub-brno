import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
import { readEnvironment } from './environment.mjs';

if (process.env.CONFIRM_QA_PRODUCTION !== 'studenthubapp.cz') throw Error('Explicit production confirmation required.');
const env = { ...await readEnvironment(), ...process.env };
const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const base = 'https://studenthubapp.cz', prefix = 'QA-2026-10-18-', suffix = randomUUID().replace(/[0-9]/g, n => String.fromCharCode(103 + Number(n))).slice(0, 6);
const users = [], results = [], created = {};
let browser;
const description = `${prefix}${suffix} Dočasná kontrola aplikace; obsah bude po testu odstraněn.`;
const future = new Date(Date.now() + 4 * 86400000).toISOString();
const assert = (value, message) => { if (!value) throw Error(message); };
const form = values => { const f = new FormData(); for (const [k, v] of Object.entries(values)) f.append(k, String(v)); return f; };
async function step(name, run) {
  if (process.env.QA_CHAT_ONLY === 'true' && !name.startsWith('Chat ')) return;
  try { await run(); results.push({ name, status: 'PASS' }); }
  catch (e) { results.push({ name, status: 'FAIL', detail: String(e.message).slice(0, 200) }); }
  console.log(JSON.stringify(results.at(-1)));
}
async function api(user, path, method = 'GET', body, statuses = [200]) {
  const payload = body instanceof FormData ? Object.fromEntries(body.entries()) : body;
  const response = await user.page.evaluate(async ({ path, method, payload, multipart }) => {
    let body;
    if (multipart) { body = new FormData(); for (const [k, v] of Object.entries(payload)) body.append(k, v); }
    else if (payload) body = JSON.stringify(payload);
    const r = await fetch(path, { method, body, headers: multipart || !payload ? {} : { 'content-type': 'application/json' } });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  }, { path, method, payload, multipart: body instanceof FormData });
  const data = response.json;
  assert(statuses.includes(response.status), `${method} ${path}: HTTP ${response.status}; fields=${Object.keys(data.issues || {}).join(',')}`);
  return data;
}
async function createUser(label, universityId, facultyId, studyYear) {
  const email = `${prefix}${suffix}-${label}@example.test`.toLowerCase(), password = `Aa1!${randomUUID()}`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  assert(!error && data.user, `Temporary account creation failed: ${error?.code || 'unknown'}`);
  const user = { id: data.user.id, username: `${prefix}${suffix}-${label}`.toLowerCase() }; users.push(user);
  user.client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await user.client.auth.signInWithPassword({ email, password }); assert(!signed.error, `Direct Auth login failed: ${signed.error?.code}`);
  const profileState = await service.from('profiles').select('role,account_status,is_blocked').eq('id', user.id).single();
  const context = await browser.newContext(); user.page = await context.newPage();
  await context.addInitScript(() => {
    localStorage.setItem('studenthub-consent', JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem('studenthub-tutorial-state', JSON.stringify({ tutorialVersion: 3, introConfirmed: true, status: 'completed' }));
    localStorage.setItem('studenthub-preference-v4', JSON.stringify({ version: 4, cityId: 'brno', completed: true }));
  });
  await user.page.goto(base + '/ucet/prihlaseni', { waitUntil: 'networkidle' });
  const response = await user.page.evaluate(async ({email,password}) => {
    const r = await fetch('/api/auth/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    return { status: r.status, ok: r.ok, body: await r.json().catch(() => ({})) };
  }, { email, password });
  const responseBody = response.body;
  const failureBranch = String(responseBody.message).startsWith('E-mail,') ? 'supabase_auth' : String(responseBody.message).startsWith('Přihlášení se nezdařilo') ? 'profile_active' : 'other';
  assert(response.ok, `Production login HTTP ${response.status}; branch=${failureBranch}; directAuth=OK; confirmed=${Boolean(data.user.email_confirmed_at)}; profile=${JSON.stringify(profileState.data)}`);
  assert((await context.cookies()).some(cookie => cookie.name.includes('auth-token')), 'Missing session cookies');
  await api(user, '/api/profile', 'PATCH', { username: user.username, displayName: `${prefix}${suffix}-${label}`, bio: description, cityId: 'brno', universityId, facultyId, studyYear, profileVisibility: 'public', communityRulesAccepted: true });
  return user;
}
async function removeWhere(table, key, ids) {
  if (!ids.length) return;
  const { error } = await service.from(table).delete().in(key, ids);
  if (error) throw Error(`Cleanup ${table}: ${error.code}`);
}
try {
  browser = await chromium.launch({ channel: 'chrome' });
  const a = await createUser('a', 'vut', 'vut-fekt', 1), b = await createUser('b', 'muni', 'muni-fi', 2);
  results.push({ name: 'Two confirmed isolated accounts, server login and profile completion', status: 'PASS', note: 'Admin-confirmed test accounts; not an email delivery test.' });
  await step('Community create/read/edit/comment/reaction/report/IDOR', async () => {
    const saved = await api(a, '/api/community/posts', 'POST', form({ category: 'Studium', body: description, cityId: 'brno' }), [201]); created.post = saved.item.id;
    const feed = await api(b, `/api/community/posts?city=brno&q=${encodeURIComponent(prefix + suffix)}`); assert(feed.items.some(p => p.id === created.post), 'Post not in feed');
    await api(a, `/api/community/posts/${created.post}`, 'PATCH', { body: description + ' Upraveno.' });
    await api(b, `/api/community/posts/${created.post}`, 'PATCH', { body: description + ' Forbidden.' }, [403, 404]);
    const comment = await api(b, `/api/community/posts/${created.post}/comments`, 'POST', { body: description, company: '' }, [201]); created.comment = comment.item.id;
    const reaction = { targetType: 'post', targetId: created.post };
    assert((await api(b, '/api/community/reactions', 'POST', reaction)).active, 'Reaction missing');
    assert(!(await api(b, '/api/community/reactions', 'POST', reaction)).active, 'Reaction not removed');
    await api(b, '/api/community/reports', 'POST', { ...reaction, reason: 'other', detail: description }, [200, 201]);
  });
  await step('Buddy create/edit/join/accept', async () => {
    const saved = await api(a, '/api/buddy-posts', 'POST', { activityType: 'study', title: prefix + suffix + ' Studium', approximateLocation: 'Brno centrum', startsAt: future, description, maxParticipants: 3, cityId: 'brno', company: '' }, [201]); created.buddy = saved.id;
    await api(a, `/api/buddy-posts/${saved.id}`, 'PATCH', { description: description + ' Upraveno.' });
    await api(b, `/api/buddy-posts/${saved.id}/join`, 'POST', { message: description }, [201]);
    const join = await service.from('buddy_join_requests').select('id').eq('post_id', saved.id).eq('requester_id', b.id).single(); assert(!join.error, 'Join missing');
    await api(a, `/api/buddy-join-requests/${join.data.id}`, 'PATCH', { status: 'accepted' });
  });
  await step('Marketplace create/read/edit and seller chat', async () => {
    const saved = await api(a, '/api/marketplace/listings', 'POST', form({ listingType: 'offer', category: 'textbook', title: prefix + suffix + ' Učebnice', shortDescription: description, description, priceMode: 'free', priceScope: 'item', semester: 'both', materialFormat: 'printed', itemCondition: 'used', handoffMethod: 'in_person', handoffLocation: 'Brno centrum', copyrightConfirmed: true, cityId: 'brno' }), [201]); created.market = saved.id;
    await api(a, `/api/marketplace/listings/${saved.id}`, 'PATCH', { action: 'update', description: description + ' Upraveno.' });
    await api(b, '/api/chat/conversations', 'POST', { contextType: 'marketplace_listing', contextId: saved.id, message: description, clientNonce: randomUUID() }, [200, 201]);
  });
  await step('Housing create/read/edit/contact/report', async () => {
    const saved = await api(a, '/api/housing/listings', 'POST', form({ listingType: 'wanted', category: 'apartment', title: prefix + suffix + ' Hledám byt', locality: 'Bohunice', availableFrom: future.slice(0, 10), stayLength: 'over_year', shortDescription: description, description, priceMonthly: 12000, utilitiesIncluded: true, wantedPersonCount: 1, cityId: 'brno', company: '' }), [201]); created.housing = saved.id;
    await api(a, `/api/housing/listings/${saved.id}`, 'PATCH', { action: 'update', version: 1, title: prefix + suffix + ' Upravená poptávka' });
    await api(b, `/api/housing/listings/${saved.id}/report`, 'POST', { reason: 'other', detail: description, company: '' }, [201]);
    await api(b, '/api/chat/conversations', 'POST', { contextType: 'housing_listing', contextId: saved.id, message: description, clientNonce: randomUUID() }, [200, 201]);
  });
  await step('Community event creates pending review', async () => {
    const saved = await api(a, '/api/community-events', 'POST', form({ title: prefix + suffix + ' Studijní setkání', category: 'Studium a vzdělávání', startsAt: future, venue: 'Brno centrum', description, isFree: true, publicVenueConsent: true, cityId: 'brno' }), [201]); created.event = saved.item.id;
    assert(saved.status === 'pending', 'Ordinary profile bypassed event moderation');
  });
  await step('Place suggestion creates pending review', async () => {
    const saved = await api(a, '/api/place-suggestions', 'POST', form({ name: prefix + suffix + ' Kontrola místa', category: 'study_room', address: 'Brno centrum', latitude: 49.195, longitude: 16.607, locationConfirmed: true, description, usefulnessReason: description, sourceUrl: 'https://studenthubapp.cz/kontakt', consent: true, photoRights: true, duplicateAcknowledged: true, cityId: 'brno' }), [201]); created.place = saved.id; assert(saved.status === 'pending', 'Place bypassed moderation');
  });
  await step('Chat request/reply/realtime/archive/mute/report', async () => {
    const saved = await api(a, '/api/chat/conversations', 'POST', { contextType: 'profile', recipientUsername: b.username, message: description, clientNonce: randomUUID() }, [200, 201]); created.chat = saved.conversation.id;
    await api(a, `/api/chat/conversations/${created.chat}/messages`, 'POST', { message: description + ' Second forbidden.', clientNonce: randomUUID() }, [403, 409, 429]);
    const reply = await api(b, `/api/chat/conversations/${created.chat}/messages`, 'POST', { message: description + ' Přijímám.', clientNonce: randomUUID() }, [201]); assert(reply.acceptedRequest, 'Reply did not accept request');
    const deliveredIds = new Set();
    const diagnostics = [];
    let ready;
    const databaseReady = new Promise(resolve => { ready = resolve; });
    const session = await b.client.auth.getSession(); await b.client.realtime.setAuth(session.data.session.access_token);
    const channel = b.client.channel(`qa-${suffix}`).on('system', { event: '*' }, payload => { diagnostics.push({ status: payload.status, message: payload.message, extension: payload.extension }); if (payload.status === 'ok' && payload.extension === 'postgres_changes') ready(); }).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${created.chat}` }, payload => { deliveredIds.add(payload.new.id); });
    try {
      await new Promise((resolve, reject) => channel.subscribe(status => { if (status === 'SUBSCRIBED') resolve(); if (['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) reject(Error('Realtime subscribe failed')); }));
      let readyTimer;
      try { await Promise.race([databaseReady, new Promise((_, reject) => { readyTimer = setTimeout(() => reject(Error('PostgreSQL subscription not ready')), 15000); })]); }
      finally { clearTimeout(readyTimer); }
      await b.page.goto(`${base}/brno/chat/${created.chat}`, { waitUntil: 'networkidle' });
      await b.page.getByRole('textbox', { name: 'Zpráva', exact: true }).waitFor();
      await b.page.bringToFront();
      let message;
      for (let index = 1; index <= 3; index++) {
        const text = description + ` Realtime kontrola ${index}.`, started = Date.now();
        message = await api(a, `/api/chat/conversations/${created.chat}/messages`, 'POST', { message: text, clientNonce: randomUUID() }, [201]);
        await b.page.getByText(text, { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
        const deadline = Date.now() + 10000; while (!deliveredIds.has(message.id) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
        assert(deliveredIds.has(message.id), 'Realtime message not delivered');
        console.log(JSON.stringify({ name: 'Realtime browser delivery', attempt: index, elapsedMs: Date.now() - started, status: 'PASS' }));
      }
      const readable = await b.client.from('chat_messages').select('id').eq('id', message.id);
      assert(!readable.error && readable.data?.length === 1, 'Recipient RLS read failed');
      console.log(JSON.stringify({ name: 'Realtime diagnostics', delivered: deliveredIds.size, diagnostics }));
      await api(b, `/api/chat/messages/${message.id}/report`, 'POST', { reason: 'other', detail: description }, [200, 201]);
      await api(b, `/api/chat/conversations/${created.chat}`, 'PATCH', { action: 'archive' });
      await api(b, `/api/chat/conversations/${created.chat}`, 'PATCH', { action: 'unarchive' });
      await api(b, `/api/chat/conversations/${created.chat}`, 'PATCH', { action: 'mute', until: null });
    } finally { await b.client.removeChannel(channel); }
  });
  await step('Scoped test moderator can hide and restore only test post', async () => {
    assert(created.post, 'Post prerequisite failed');
    const promoted = await service.from('profiles').update({ role: 'city_editor', city_id: 'brno', faculty_id: null }).eq('id', a.id); assert(!promoted.error, 'Test role setup failed');
    try { for (const action of ['hide', 'restore']) await api(a, '/api/admin/community', 'PATCH', { targetType: 'post', targetId: created.post, action, reason: description }); }
    finally { const restored = await service.from('profiles').update({ role: 'user', faculty_id: 'vut-fekt' }).eq('id', a.id); assert(!restored.error, 'Test role cleanup failed'); }
  });
  await step('Owned deletion through APIs', async () => {
    for (const [key, route] of [['market', 'marketplace/listings'], ['housing', 'housing/listings'], ['buddy', 'buddy-posts'], ['event', 'community-events'], ['post', 'community/posts']]) {
      assert(created[key], `Missing ${key} prerequisite`); await api(a, `/api/${route}/${created[key]}`, 'DELETE', undefined, [200, 204]);
    }
  });
  await step('Logout clears protected access', async () => { await api(b, '/api/auth/logout', 'POST'); await api(b, '/api/account/content', 'GET', undefined, [401]); });
} catch (error) { results.push({ name: 'Production prerequisites', status: 'BLOCKED', detail: String(error.message).slice(0, 200) }); }
finally {
  await browser?.close();
  const ids = users.map(u => u.id), failures = [];
  async function clean(table, key, values = ids) { try { await removeWhere(table, key, values); } catch (e) { failures.push(e.message); } }
  if (ids.length) {
    const markets = await service.from('marketplace_listings').select('id').in('seller_id', ids);
    if (markets.error) failures.push('Marketplace cleanup inventory failed');
    const marketIds = (markets.data || []).map(row => row.id);
    for (const table of ['marketplace_history', 'marketplace_reports', 'marketplace_messages']) await clean(table, 'listing_id', marketIds);
    const conversations = await service.from('chat_conversation_members').select('conversation_id').in('profile_id', ids);
    if (conversations.error) failures.push('Conversation cleanup inventory failed');
    await clean('chat_conversations', 'id', (conversations.data || []).map(r => r.conversation_id));
    await clean('community_moderation_history', 'actor_id');
    for (const [table, key] of [['community_reports', 'reporter_id'], ['community_reactions', 'user_id'], ['community_comments', 'author_id'], ['community_posts', 'author_id'], ['buddy_join_requests', 'requester_id'], ['buddy_posts', 'owner_id'], ['community_events', 'author_id'], ['marketplace_listings', 'seller_id'], ['housing_listings', 'author_id'], ['place_submissions', 'author_id']]) await clean(table, key);
    for (const user of users) { await user.client?.auth.signOut(); const deleted = await service.auth.admin.deleteUser(user.id); if (deleted.error) failures.push('Temporary account removal failed'); }
    for (const table of ['profiles', 'community_posts', 'community_events', 'place_submissions']) {
      const key = table === 'profiles' ? 'id' : 'author_id';
      const remaining = await service.from(table).select('id', { count: 'exact', head: true }).in(key, ids);
      if (remaining.error || remaining.count) failures.push(`Remaining rows or unverifiable cleanup: ${table}`);
    }
  }
  results.push({ name: 'Temporary data cleanup', status: failures.length ? 'FAIL' : 'PASS', detail: failures.join('; '), accounts: ids.length, filesCreated: 0 });
  await mkdir('artifacts/release-2026-10-19', { recursive: true });
  await writeFile('artifacts/release-2026-10-19/workflows.json', JSON.stringify({ at: new Date().toISOString(), prefix, run: suffix, created, results }, null, 2));
  console.log(JSON.stringify({ results }));
  if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;
}
