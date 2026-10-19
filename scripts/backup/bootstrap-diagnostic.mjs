import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Used only BEFORE the production snapshot is imported. Never print SQL restore
// errors here: PostgreSQL COPY diagnostics can contain actual private row data.
export function bootstrapDiagnostic(text, env = {}) {
  let safe = String(text).replace(/\x1b\[[0-9;]*m/g, '');
  for (const [name, value] of Object.entries(env)) if (/SECRET|PASSWORD|TOKEN|KEY|IDENTITY/.test(name) && value) safe = safe.split(value).join('[redacted]');
  return safe.split(/\r?\n/).filter(line => /error|failed|denied|timeout|unhealthy|not found|not running|unreachable|incompatible/i.test(line)).slice(-8).map(line => line
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[database URL]')
    .replace(/(?:password|secret|token|key)\s*[:=]\s*\S+/gi, '[credential]')
    .replace(/[a-zA-Z0-9_+\/=.-]{24,}/g, '[opaque value]')
    .slice(0, 300)).join('\n') || 'No safe bootstrap error line was available.';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(bootstrapDiagnostic(await readFile(process.argv[2], 'utf8'), process.env));
