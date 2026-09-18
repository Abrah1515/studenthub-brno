import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

const run = promisify(execFile);
export const project = JSON.parse(await readFile(".vercel/project.json", "utf8"));
export async function vercelGet(endpoint) {
  if (!/^\/v\d+\/[a-zA-Z0-9_/.-]+$/.test(endpoint)) throw new Error("Invalid audit API path");
  try {
    const { stdout } = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `pnpm dlx vercel api '${endpoint}' --method GET --raw`], { maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    return JSON.parse(stdout.slice(stdout.indexOf("{")));
  } catch {
    throw new Error("Vercel metadata request failed; raw response suppressed.");
  }
}
