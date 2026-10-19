import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function copyCounts(files) {
  const counts = new Map(); let active;
  for (const file of files) {
    for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
      if (active) { if (line === '\\.') active = null; else counts.set(active, counts.get(active) + 1); continue; }
      const match = line.match(/^COPY ("(?:[^"\r\n]|"")+"\."(?:[^"\r\n]|"")+") \(.+\) FROM stdin;$/);
      if (match) { active = match[1]; if (counts.has(active)) throw Error('Duplicate COPY target'); counts.set(active, 0); }
    }
    if (active) throw Error('Incomplete COPY block');
  }
  return counts;
}

export function safeObjectPath(root, bucket, objectPath) {
  if (!/^[a-zA-Z0-9_-]+$/.test(bucket) || !objectPath || objectPath.includes('\\') || objectPath.split('/').some(s => !s || s === '.' || s === '..')) throw Error('Unsafe Storage restore path');
  const destination = path.resolve(root, bucket, objectPath);
  if (!destination.startsWith(path.resolve(root) + path.sep)) throw Error('Unsafe Storage restore target');
  return destination;
}

async function verify(directory, container, storageDestination) {
  if (!/^supabase_db_studenthub-restore-[0-9]+-[0-9]+$/.test(container)) throw Error('Only an explicitly isolated restore container is allowed');
  const networks = execFileSync('docker', ['inspect', '--format', '{{len .NetworkSettings.Networks}}', container], { encoding: 'utf8' }).trim();
  if (networks !== '0') throw Error('Restore database must have no network attachment');
  const counts = await copyCounts([path.join(directory, 'database/data.sql'), path.join(directory, 'database/history_data.sql')]);
  for (const table of ['"public"."profiles"', '"public"."academic_events"', '"auth"."users"', '"storage"."objects"']) if (!counts.has(table)) throw Error('Critical backup table is absent');
  const unions = [...counts.keys()].map((table, index) => `select ${index} as id, count(*) as n from ${table}`).join(' union all ');
  const sql = `select json_build_object('counts',(select json_agg(r order by id) from (${unions}) r),'triggers',(select count(*) from pg_trigger t join pg_proc f on f.oid=t.tgfoid join pg_namespace fn on fn.oid=f.pronamespace join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('auth','storage') and fn.nspname='public'),'policies',(select count(*) from pg_policies where schemaname in ('auth','storage')),'protected',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('profiles','chat_messages','chat_conversations','community_posts','housing_listings','marketplace_listings') and c.relrowsecurity),'cronDisabled',current_setting('cron.launch_active_jobs',true)='off');`;
  let result;
  try { result = JSON.parse(execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })); }
  catch { throw Error('Restored database verification failed; private diagnostics suppressed'); }
  const expected = [...counts.values()];
  if (result.counts.length !== expected.length || result.counts.some((row, i) => Number(row.n) !== expected[i])) throw Error('Restored row counts differ from COPY snapshot');
  const managed = JSON.parse(await readFile(path.join(directory, 'database/managed.json'), 'utf8'));
  if (Number(result.triggers) !== managed.triggerCount || Number(result.policies) !== managed.policyCount || Number(result.protected) !== 6 || !result.cronDisabled) throw Error('Restored security metadata is incomplete');
  // Disposable transaction in the network-disconnected clone only. Verify that
  // restored Auth triggers still create an ordinary profile despite hostile metadata.
  const probe = `begin; insert into auth.users(id,email,raw_user_meta_data) values ('00000000-0000-4000-8000-000000000001','isolated-restore-probe@example.invalid','{"role":"super_admin"}'); select role = 'user' and account_status = 'active' from public.profiles where id = '00000000-0000-4000-8000-000000000001'; set local role authenticated; select count(*) = 0 from public.chat_messages; rollback;`;
  let security;
  try { security = execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-c', probe], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { throw Error('Restored Auth trigger/RLS probe failed; private diagnostics suppressed'); }
  if (security !== 't\nt') throw Error('Restored Auth profile or private chat RLS probe did not pass');
  const storage = JSON.parse(await readFile(path.join(directory, 'storage/objects.json'), 'utf8'));
  for (const object of storage.objects) {
    const target = safeObjectPath(storageDestination, object.bucket, object.path);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await copyFile(path.join(directory, 'storage/objects', object.file), target);
    const hash = createHash('sha256'); for await (const bytes of createReadStream(target)) hash.update(bytes);
    if (hash.digest('hex') !== object.sha256) throw Error('Restored Storage object checksum differs');
  }
  console.log(JSON.stringify({ status: 'PASS', databaseRestored: true, tables: counts.size, rows: expected.reduce((a, b) => a + b, 0), managedTriggers: result.triggers, managedPolicies: result.policies, protectedTables: result.protected, authTriggerProbe: true, privateChatRlsProbe: true, storageFilesRestored: storage.objects.length, networkAttachments: 0, cronDisabled: true }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await verify(...process.argv.slice(2));
