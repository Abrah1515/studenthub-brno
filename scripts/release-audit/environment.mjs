import { readFile } from "node:fs/promises";

export async function readEnvironment(path = ".env.local") {
  try {
    return Object.fromEntries((await readFile(path, "utf8")).split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      return match ? [[match[1], match[2].trim().replace(/^(['"])(.*)\1$/, "$2")]] : [];
    }));
  } catch { return {}; }
}

export const artifactRoot = "artifacts/release-audit-2026-09-13";
