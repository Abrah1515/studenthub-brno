import { spawn } from "node:child_process";
import { readEnvironment } from "./environment.mjs";

const env = await readEnvironment(".env.vercel");
const local = await readEnvironment();
const feed = [local.FAJN_BRIGADY_FEED_URL,env.FAJN_BRIGADY_FEED_URL].find(value => value?.startsWith("https://media.fajnsprava.cz/exporty/boxy/"));
if (!feed) {
  console.error("BLOCKED: readable production feed URL unavailable; configured metadata is not a usable credential.");
  process.exit(2);
}
const child = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--configLoader", "runner", "tests/integration/fajn-live.integration.test.ts", "--maxWorkers=1"], {
  env: { ...process.env, FAJN_LIVE_TEST: "true", FAJN_PRODUCTION_FEED_TEST: "true", FAJN_BRIGADY_FEED_URL: feed },
  stdio: "inherit", windowsHide: true,
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
