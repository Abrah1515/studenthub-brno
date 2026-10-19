import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function* restoreDataLines(files) {
  for (const file of files) {
    let copying = false;
    for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
      if (copying) { if (line === '\\.') copying = false; }
      else {
        const copy = line.match(/^COPY "([a-zA-Z0-9_]+)"\."([a-zA-Z0-9_]+)" \(.+\) FROM stdin;$/);
        if (copy) { yield `\\echo RESTORE_TABLE:${copy[1]}.${copy[2]}\n`; copying = true; }
      }
      yield line + '\n';
    }
    if (copying) throw Error('Incomplete COPY stream');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) for await (const line of restoreDataLines(process.argv.slice(2))) {
  if (!process.stdout.write(line)) await new Promise(resolve => process.stdout.once('drain', resolve));
}
