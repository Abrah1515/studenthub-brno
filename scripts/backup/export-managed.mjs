import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { validateSupabaseTarget } from './check-config.mjs';

validateSupabaseTarget(process.env.SUPABASE_URL, process.env.SUPABASE_DB_URL);
const url = new URL(process.env.SUPABASE_DB_URL);
const query = await readFile(new URL('./managed-metadata.sql', import.meta.url), 'utf8');
const destination = process.argv[2];
if (!destination) throw Error('Private backup destination required');
let result;
try {
  result = await promisify(execFile)('docker', ['run', '--rm', '-e', 'PGHOST', '-e', 'PGPORT', '-e', 'PGUSER', '-e', 'PGPASSWORD', '-e', 'PGDATABASE', '-e', 'PGSSLMODE', '-e', 'PGOPTIONS', 'postgres:17-alpine', 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-c', query], {
    env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: url.pathname.slice(1), PGSSLMODE: 'require', PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=60000' },
    maxBuffer: 8 * 1024 * 1024,
  });
} catch { throw Error('Read-only managed metadata export failed; private diagnostics suppressed'); }
const metadata = JSON.parse(result.stdout);
if (!metadata.triggerCount || !metadata.policyCount) throw Error('Required Auth triggers or Storage policies are missing');
await writeFile(path.join(destination, 'managed.sql'), metadata.sql + '\n', { mode: 0o600 });
await writeFile(path.join(destination, 'managed.json'), JSON.stringify({ triggerCount: metadata.triggerCount, policyCount: metadata.policyCount }) + '\n', { mode: 0o600 });
console.log(`Managed metadata exported: ${metadata.triggerCount} triggers, ${metadata.policyCount} policies.`);
