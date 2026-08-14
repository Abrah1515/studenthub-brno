import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const nextCli = resolve(root, "node_modules", "next", "dist", "bin", "next");
const playwrightCli = resolve(root, "node_modules", "@playwright", "test", "cli.js");
const e2ePort = process.env.E2E_PORT || "3107";
const address = `http://127.0.0.1:${e2ePort}`;

function run(command, args, options = {}) {
  const { env: extraEnv, ...spawnOptions } = options;
  return spawn(command, args, {
    cwd: root,
    env: { ...process.env, CI: process.env.CI ?? "true", DEMO_MODE: "true", ALLOW_LOCAL_FILE_STORE: "true", ALLOW_VERIFIED_FALLBACK: "true", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "", ADMIN_DEMO_PASSWORD: process.env.ADMIN_DEMO_PASSWORD || "local-test-password-2026", ADMIN_COOKIE_SECRET: process.env.ADMIN_COOKIE_SECRET || "local-test-cookie-secret-at-least-32-characters", NEXT_PUBLIC_ADS_ENABLED: "false", ...extraEnv },
    stdio: "inherit",
    ...spawnOptions,
  });
}

async function assertPortFree() {
  try {
    const response = await fetch(address, { signal: AbortSignal.timeout(1_500) });
    throw new Error(`Port ${e2ePort} už používá proces odpovídající HTTP ${response.status}.`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`Port ${e2ePort}`)) throw error;
  }
}

async function waitForExit(child) {
  const [code, signal] = await once(child, "exit");
  if (code !== 0) {
    throw new Error(`Proces skončil s kódem ${code ?? "?"}${signal ? ` (${signal})` : ""}.`);
  }
}

async function waitForServer(child, timeoutMs = 60_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error("Produkční server skončil dříve, než začal odpovídat.");
    }

    try {
      const response = await fetch(address, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
        if (child.exitCode !== null) throw new Error("Produkční server se nespustil; port může používat jiný proces.");
        return;
      }
    } catch {
      // Server ještě startuje.
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }

  throw new Error(`Server na ${address} nezačal odpovídat do ${timeoutMs / 1000} sekund.`);
}

async function stopServer(server) {
  if (!server) return;

  if (process.platform === "win32") {
    const netstat = spawnSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
    const listenerPattern = new RegExp(`127\\.0\\.0\\.1:${e2ePort}\\s+0\\.0\\.0\\.0:0\\s+LISTENING\\s+(\\d+)`, "g");
    const listenerPids = [...String(netstat.stdout || "").matchAll(listenerPattern)].map((match) => Number(match[1])).filter(Number.isInteger);
    for (const pid of new Set(listenerPids)) {
      spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`], { stdio: "ignore" });
    }
    if (server.exitCode === null && server.signalCode === null) server.kill();
    return;
  }

  if (server.exitCode !== null || server.signalCode !== null) return;

  server.kill("SIGTERM");
  await Promise.race([
    once(server, "exit"),
    new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000)),
  ]);

  if (server.exitCode === null && server.signalCode === null) {
    server.kill("SIGKILL");
    await once(server, "exit");
  }
}

let server;

try {
  await assertPortFree();
  rmSync(resolve(root, ".next"), { recursive: true, force: true });
  console.log("\n[E2E] Vytvářím produkční build…\n");
  await waitForExit(run(process.execPath, [nextCli, "build"]));

  console.log("\n[E2E] Spouštím izolovaný produkční server…\n");
  server = run(process.execPath, [nextCli, "start", "--hostname", "127.0.0.1", "--port", e2ePort]);
  await waitForServer(server);

  console.log("\n[E2E] Spouštím Playwright…\n");
  const playwrightArguments = process.argv.slice(2).filter((argument) => argument !== "--");
  await waitForExit(run(process.execPath, [playwrightCli, "test", ...playwrightArguments], { env: { PLAYWRIGHT_BASE_URL: address } }));
} catch (error) {
  console.error("\n[E2E]", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await stopServer(server);
}
