import { copyFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, devices, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { featureFlows, overviewOrder } from "./flows.ts";
import {
  CaptureSkippedError,
  convertWebmToMp4,
  createMontage,
  ensureDirectory,
  outputSize,
  pageContainsSensitiveContact,
  pause,
  relativePath,
  sanitizeError,
  urlFor,
  utmUrl,
  validatePng,
  validateVideo,
  viewport,
  waitForStablePage,
} from "./helpers.ts";
import type { CaptureManifest, CaptureOptions, FeatureFlowId, FlowDefinition, FlowId, FlowResult } from "./types.ts";

const root = path.resolve(import.meta.dirname, "../..");
const outputRoot = path.resolve(root, "marketing-output");
const videosDirectory = path.join(outputRoot, "videos");
const screenshotsDirectory = path.join(outputRoot, "screenshots");
const metadataDirectory = path.join(outputRoot, "metadata");
const debugDirectory = path.join(outputRoot, "debug");
const temporaryDirectory = path.join(outputRoot, ".tmp");

function printHelp() {
  console.log(`StudentHub marketing capture

Použití:
  npm run marketing:capture
  npm run marketing:capture -- --base-url http://localhost:3000
  npm run marketing:capture -- --only brigady

Volby:
  --base-url <url>       Zdrojová URL (výchozí: https://studenthubapp.cz)
  --only <flow>          intro|brigady|kalendar|mista|bydleni|partak|komunita|overview
  --headed               Zobrazí browser pro ladění
  --no-video             Vytvoří jen screenshoty a metadata
  --no-screenshots       Vytvoří jen videa a metadata
  --help                 Zobrazí tuto nápovědu`);
}

function argumentValue(args: string[], index: number, name: string) {
  const inline = args[index].match(new RegExp(`^${name}=(.+)$`));
  if (inline) return { value: inline[1], consumed: 0 };
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} vyžaduje hodnotu.`);
  return { value, consumed: 1 };
}

function parseArguments(args: string[]): CaptureOptions | null {
  const options: CaptureOptions = {
    baseUrl: "https://studenthubapp.cz",
    headed: false,
    video: true,
    screenshots: true,
  };
  const validFlows = new Set<FlowId>([...featureFlows.map((flow) => flow.id), "overview"]);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") continue;
    if (argument === "--help" || argument === "-h") {
      printHelp();
      return null;
    }
    if (argument === "--headed") options.headed = true;
    else if (argument === "--no-video") options.video = false;
    else if (argument === "--no-screenshots") options.screenshots = false;
    else if (argument === "--base-url" || argument.startsWith("--base-url=")) {
      const parsed = argumentValue(args, index, "--base-url");
      options.baseUrl = parsed.value;
      index += parsed.consumed;
    } else if (argument === "--only" || argument.startsWith("--only=")) {
      const parsed = argumentValue(args, index, "--only");
      if (!validFlows.has(parsed.value as FlowId)) throw new Error(`Neznámý flow "${parsed.value}".`);
      options.only = parsed.value as FlowId;
      index += parsed.consumed;
    } else throw new Error(`Neznámá volba "${argument}". Použijte --help.`);
  }

  const baseUrl = new URL(options.baseUrl);
  if (!new Set(["http:", "https:"]).has(baseUrl.protocol)) throw new Error("--base-url musí používat http nebo https.");
  baseUrl.pathname = baseUrl.pathname.replace(/\/$/, "") || "/";
  baseUrl.search = "";
  baseUrl.hash = "";
  options.baseUrl = baseUrl.toString().replace(/\/$/, "");
  if (!options.video && !options.screenshots) throw new Error("--no-video a --no-screenshots nelze použít současně.");
  return options;
}

function outputName(order: number, id: string, extension: "mp4" | "png" | "json") {
  return `${String(order).padStart(2, "0")}-${id}.${extension}`;
}

function assertSafeOutputRoot() {
  const expected = path.join(root, "marketing-output");
  if (outputRoot !== expected || !outputRoot.startsWith(`${root}${path.sep}`)) throw new Error("Neplatná cesta marketing-output.");
}

async function prepareOutput(options: CaptureOptions) {
  assertSafeOutputRoot();
  if (!options.only) {
    await rm(outputRoot, { recursive: true, force: true });
  } else {
    const flow = options.only === "overview" ? { id: "overview", order: 8 } : featureFlows.find((item) => item.id === options.only);
    if (flow) {
      await Promise.all([
        rm(path.join(videosDirectory, outputName(flow.order, flow.id, "mp4")), { force: true }),
        rm(path.join(screenshotsDirectory, outputName(flow.order, flow.id, "png")), { force: true }),
        rm(path.join(metadataDirectory, outputName(flow.order, flow.id, "json")), { force: true }),
        rm(path.join(debugDirectory, `${flow.id}-error.png`), { force: true }),
      ]);
    }
  }
  await Promise.all([videosDirectory, screenshotsDirectory, metadataDirectory, debugDirectory, temporaryDirectory].map(ensureDirectory));
}

async function launchBrowser(headed: boolean): Promise<Browser> {
  if (!headed) return await chromium.launch({ headless: true });
  try {
    return await chromium.launch({ headless: false });
  } catch {
    return await chromium.launch({ headless: false, channel: "chrome" });
  }
}

async function createCaptureContext(browser: Browser, recordVideo: boolean): Promise<BrowserContext> {
  const pixel = devices["Pixel 5"];
  const context = await browser.newContext({
    ...pixel,
    viewport,
    screen: viewport,
    deviceScaleFactor: 2.5,
    locale: "cs-CZ",
    timezoneId: "Europe/Prague",
    colorScheme: "light",
    serviceWorkers: "block",
    acceptDownloads: false,
    permissions: [],
    ...(recordVideo ? { recordVideo: { dir: temporaryDirectory, size: viewport } } : {}),
  });
  await context.clearPermissions();
  await context.addInitScript(() => {
    localStorage.setItem("studenthub-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false }));
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: null, facultyId: null, studyYear: null, studyYearCycleStart: null, completed: true }));
    localStorage.setItem("studenthub-tutorial-state", JSON.stringify({ tutorialVersion: 3, introConfirmed: true, status: "completed", lastCompletedStep: "complete" }));
    localStorage.setItem("studenthub-theme", "light");
  });
  return context;
}

type PageDiagnostics = {
  blockedWriteRequests: string[];
  httpErrors: string[];
  consoleErrors: string[];
};

async function protectReadOnly(page: Page, baseUrl: string, diagnostics: PageDiagnostics) {
  const origin = new URL(baseUrl).origin;
  await page.route("**/*", async (route) => {
    const method = route.request().method().toUpperCase();
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      diagnostics.blockedWriteRequests.push(`${method} ${new URL(route.request().url()).pathname}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().startsWith(origin)) {
      diagnostics.httpErrors.push(`${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`);
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().toLowerCase().includes("favicon")) diagnostics.consoleErrors.push(message.text().slice(0, 500));
  });
}

function baseResult(flow: { id: FlowId; title: string; route: string }, baseUrl: string): Omit<FlowResult, "status" | "notes"> {
  const destinationUrl = urlFor(baseUrl, flow.route);
  return {
    id: flow.id,
    title: flow.title,
    route: flow.route,
    destinationUrl,
    suggestedOrganicUrl: utmUrl(destinationUrl, "organic", flow.id),
    suggestedPaidUrl: utmUrl(destinationUrl, "paid_social", flow.id),
  };
}

async function writeFlowMetadata(order: number, result: FlowResult, diagnostics?: PageDiagnostics) {
  const body = {
    ...result,
    diagnostics: diagnostics ? {
      blockedWriteRequests: [...new Set(diagnostics.blockedWriteRequests)],
      httpErrors: [...new Set(diagnostics.httpErrors)],
      consoleErrors: [...new Set(diagnostics.consoleErrors)],
    } : undefined,
  };
  await writeFile(path.join(metadataDirectory, outputName(order, result.id, "json")), `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

async function captureFeature(browser: Browser, flow: FlowDefinition, options: CaptureOptions): Promise<FlowResult> {
  const base = baseResult(flow, options.baseUrl);
  const videoPath = path.join(videosDirectory, outputName(flow.order, flow.id, "mp4"));
  const screenshotPath = path.join(screenshotsDirectory, outputName(flow.order, flow.id, "png"));
  const debugPath = path.join(debugDirectory, `${flow.id}-error.png`);
  const diagnostics: PageDiagnostics = { blockedWriteRequests: [], httpErrors: [], consoleErrors: [] };
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let rawVideoPath: string | undefined;
  let screenshotInfo;
  let recordingStartedAt = 0;
  let contentStartedAt = 0;
  let contentDurationSeconds = 0;

  console.log(`\n[${String(flow.order).padStart(2, "0")}] ${flow.title}`);
  try {
    context = await createCaptureContext(browser, options.video);
    page = await context.newPage();
    // Playwright začne WebM až při vytvoření stránky; čas po newPage je přesnější
    // než čas před vytvářením kontextu a nepřestřihne první čisté snímky.
    recordingStartedAt = Date.now();
    await protectReadOnly(page, options.baseUrl, diagnostics);
    const response = await page.goto(urlFor(options.baseUrl, flow.route), { waitUntil: "domcontentloaded", timeout: 35_000 });
    if (!response || response.status() >= 400) throw new Error(`Navigace vrátila HTTP ${response?.status() ?? "bez odpovědi"}.`);
    await waitForStablePage(page, flow.heading);

    contentStartedAt = Date.now();
    let screenshotTaken = false;
    const notes = await flow.capture(page, {
      screenshot: async () => {
        if (!options.screenshots || screenshotTaken) return;
        await page!.screenshot({ path: screenshotPath, fullPage: false, animations: "disabled", caret: "hide", scale: "device" });
        screenshotInfo = await validatePng(screenshotPath);
        screenshotTaken = true;
      },
    });
    if (options.screenshots && !screenshotTaken) {
      await page.screenshot({ path: screenshotPath, fullPage: false, animations: "disabled", caret: "hide", scale: "device" });
      screenshotInfo = await validatePng(screenshotPath);
    }

    let elapsed = (Date.now() - contentStartedAt) / 1_000;
    const durationReserveSeconds = 1;
    if (elapsed < flow.minDurationSeconds + durationReserveSeconds) {
      await pause((flow.minDurationSeconds + durationReserveSeconds - elapsed) * 1_000);
    }
    await pause(700);
    elapsed = (Date.now() - contentStartedAt) / 1_000;
    contentDurationSeconds = Math.min(flow.maxDurationSeconds, elapsed);

    const video = page.video();
    await page.close();
    await context.close();
    page = undefined;
    context = undefined;
    if (video) rawVideoPath = await video.path();

    let videoInfo;
    if (options.video) {
      if (!rawVideoPath) throw new Error("Playwright nevytvořil zdrojové WebM.");
      const trimStartSeconds = Math.max(0, (contentStartedAt - recordingStartedAt) / 1_000);
      await convertWebmToMp4(rawVideoPath, videoPath, trimStartSeconds, contentDurationSeconds);
      videoInfo = await validateVideo(videoPath);
      if (videoInfo.durationSeconds < flow.minDurationSeconds - 0.4) {
        throw new Error(`Výsledné video je příliš krátké (${videoInfo.durationSeconds.toFixed(2)} s).`);
      }
    }

    const result: FlowResult = {
      ...base,
      status: "completed",
      ...(videoInfo ? { video: relativePath(outputRoot, videoPath), durationSeconds: videoInfo.durationSeconds, videoInfo } : {}),
      ...(screenshotInfo ? { screenshot: relativePath(outputRoot, screenshotPath), screenshotInfo } : {}),
      notes: [
        ...notes,
        ...(diagnostics.blockedWriteRequests.length ? [`Read-only pojistka zablokovala ${diagnostics.blockedWriteRequests.length} neočekávaných write requestů.`] : []),
      ],
    };
    await writeFlowMetadata(flow.order, result, diagnostics);
    console.log(`    completed${videoInfo ? ` · ${videoInfo.durationSeconds.toFixed(2)} s` : ""}`);
    return result;
  } catch (error) {
    const skipped = error instanceof CaptureSkippedError;
    const reason = sanitizeError(error);
    if (page && !skipped && !await pageContainsSensitiveContact(page).catch(() => true)) {
      await page.screenshot({ path: debugPath, fullPage: false, animations: "disabled", caret: "hide", scale: "device" }).catch(() => undefined);
    }
    const video = page?.video();
    await page?.close().catch(() => undefined);
    await context?.close().catch(() => undefined);
    if (!rawVideoPath && video) rawVideoPath = await video.path().catch(() => undefined);
    await Promise.all([
      rm(videoPath, { force: true }),
      rm(screenshotPath, { force: true }),
      rawVideoPath ? rm(rawVideoPath, { force: true }) : Promise.resolve(),
    ]);
    const result: FlowResult = {
      ...base,
      status: skipped ? "skipped" : "failed",
      reason,
      notes: skipped ? ["Flow byl bezpečně přeskočen; ostatní capture pokračují."] : [],
    };
    await writeFlowMetadata(flow.order, result, diagnostics);
    console.log(`    ${result.status} · ${reason.split("\n")[0]}`);
    return result;
  } finally {
    if (rawVideoPath) await rm(rawVideoPath, { force: true }).catch(() => undefined);
  }
}

async function existingFeatureVideo(id: FeatureFlowId) {
  const flow = featureFlows.find((item) => item.id === id)!;
  const filePath = path.join(videosDirectory, outputName(flow.order, id, "mp4"));
  try {
    await validateVideo(filePath);
    return filePath;
  } catch {
    return null;
  }
}

async function existingFeatureScreenshot(id: FeatureFlowId) {
  const flow = featureFlows.find((item) => item.id === id)!;
  const filePath = path.join(screenshotsDirectory, outputName(flow.order, id, "png"));
  try {
    await validatePng(filePath);
    return filePath;
  } catch {
    return null;
  }
}

async function createOverview(options: CaptureOptions, currentResults: FlowResult[]): Promise<FlowResult> {
  const overview = { id: "overview" as const, title: "Overview", route: "/brno" };
  const base = baseResult(overview, options.baseUrl);
  const videoPath = path.join(videosDirectory, outputName(8, overview.id, "mp4"));
  const screenshotPath = path.join(screenshotsDirectory, outputName(8, overview.id, "png"));
  console.log("\n[08] Overview");

  try {
    let videoInfo;
    const notes: string[] = [];
    if (options.video) {
      const completedVideoPaths = new Map(currentResults.filter((item) => item.status === "completed" && item.video).map((item) => [item.id, path.join(outputRoot, item.video!)]));
      const inputs: string[] = [];
      for (const id of overviewOrder) {
        const fromRun = completedVideoPaths.get(id);
        const existing = fromRun || (options.only === "overview" ? await existingFeatureVideo(id) : null);
        if (existing) inputs.push(existing);
      }
      if (inputs.length < 2) throw new CaptureSkippedError("Overview nelze vytvořit bez alespoň dvou hotových feature videí.");
      await createMontage(inputs, videoPath);
      videoInfo = await validateVideo(videoPath);
      notes.push(`Čistý střih z ${Math.min(inputs.length, 6)} hotových feature klipů bez overlayů a hudby.`);
    }

    let screenshotInfo;
    if (options.screenshots) {
      const completedScreenshots = new Map(currentResults.filter((item) => item.status === "completed" && item.screenshot).map((item) => [item.id, path.join(outputRoot, item.screenshot!)]));
      let source = completedScreenshots.get("intro");
      if (!source && options.only === "overview") source = await existingFeatureScreenshot("intro") || undefined;
      if (!source) source = [...completedScreenshots.values()][0];
      if (!source && options.only === "overview") {
        for (const id of overviewOrder) {
          const candidate = await existingFeatureScreenshot(id);
          if (candidate) { source = candidate; break; }
        }
      }
      if (!source) throw new CaptureSkippedError("Overview screenshot nelze vytvořit bez hotového feature screenshotu.");
      await copyFile(source, screenshotPath);
      screenshotInfo = await validatePng(screenshotPath);
      notes.push("Overview screenshot používá čistý homepage frame bez textového overlaye.");
    }

    const result: FlowResult = {
      ...base,
      status: "completed",
      ...(videoInfo ? { video: relativePath(outputRoot, videoPath), durationSeconds: videoInfo.durationSeconds, videoInfo } : {}),
      ...(screenshotInfo ? { screenshot: relativePath(outputRoot, screenshotPath), screenshotInfo } : {}),
      notes,
    };
    await writeFlowMetadata(8, result);
    console.log(`    completed${videoInfo ? ` · ${videoInfo.durationSeconds.toFixed(2)} s` : ""}`);
    return result;
  } catch (error) {
    await Promise.all([rm(videoPath, { force: true }), rm(screenshotPath, { force: true })]);
    const result: FlowResult = {
      ...base,
      status: error instanceof CaptureSkippedError ? "skipped" : "failed",
      reason: sanitizeError(error),
      notes: [],
    };
    await writeFlowMetadata(8, result);
    console.log(`    ${result.status} · ${result.reason}`);
    return result;
  }
}

function formatBytes(bytes?: number) {
  if (bytes === undefined) return "—";
  return `${(bytes / 1_048_576).toFixed(2)} MB`;
}

function commandExamples(baseUrl: string) {
  return [
    "npm run marketing:capture",
    `npm run marketing:capture -- --base-url ${baseUrl}`,
    "npm run marketing:capture -- --only brigady",
    "npm run marketing:capture -- --headed",
    "npm run marketing:capture -- --no-video",
    "npm run marketing:capture -- --no-screenshots",
  ];
}

async function writeSummary(options: CaptureOptions, results: FlowResult[]) {
  const manifest: CaptureManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    viewport: { ...viewport, aspectRatio: "9:16" },
    output: { ...outputSize, videoCodec: "h264", screenshotFormat: "png" },
    readOnly: true,
    flows: results,
  };
  await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const generatedLocal = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "long", timeStyle: "medium", timeZone: "Europe/Prague" }).format(new Date(manifest.generatedAt));
  const rows = results.map((result) => {
    const status = result.status === "completed" ? "completed" : `${result.status}: ${result.reason || "bez důvodu"}`;
    return `| ${result.title} | ${status.replaceAll("|", "\\|")} | ${result.durationSeconds?.toFixed(2) || "—"} | ${result.video || "—"} | ${result.screenshot || "—"} |`;
  }).join("\n");
  const readme = `# StudentHub marketing capture

Capture vytvořen: **${generatedLocal}**  
Base URL: **${options.baseUrl}**  
Mobilní viewport: **${viewport.width} × ${viewport.height} (9:16)**  
Výstup: **${outputSize.width} × ${outputSize.height}**, MP4/H.264 a PNG

| Flow | Stav | Délka (s) | Video | Screenshot |
| --- | --- | ---: | --- | --- |
${rows}

## Nové spuštění

${commandExamples(options.baseUrl).map((command) => `\`${command}\``).join("\n\n")}

Capture používá anonymní browser context, blokuje všechny síťové metody kromě GET/HEAD/OPTIONS a neprovádí publikační ani jiné produkční zápisy. Technické údaje jednotlivých flow jsou v \`metadata/\`; diagnostické screenshoty neúspěšných flow jsou v \`debug/\`, pokud jejich pořízení neohrožovalo soukromí.
`;
  await writeFile(path.join(outputRoot, "README.md"), readme, "utf8");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options) return;
  await prepareOutput(options);

  const selectedFeatures = options.only && options.only !== "overview"
    ? featureFlows.filter((flow) => flow.id === options.only)
    : options.only === "overview" ? [] : featureFlows;
  const results: FlowResult[] = [];
  let browser: Browser | undefined;

  try {
    if (selectedFeatures.length) {
      browser = await launchBrowser(options.headed);
      for (const flow of selectedFeatures) results.push(await captureFeature(browser, flow, options));
    }
    if (!options.only || options.only === "overview") results.push(await createOverview(options, results));
  } finally {
    await browser?.close().catch(() => undefined);
  }

  await writeSummary(options, results);
  await rm(temporaryDirectory, { recursive: true, force: true });

  const completed = results.filter((result) => result.status === "completed");
  console.log("\nVýsledek:");
  for (const result of results) {
    console.log(`  ${result.title}: ${result.status}${result.durationSeconds ? ` · ${result.durationSeconds.toFixed(2)} s` : ""}${result.videoInfo ? ` · ${formatBytes(result.videoInfo.sizeBytes)}` : ""}`);
  }
  console.log(`\nManifest: ${path.join(outputRoot, "manifest.json")}`);
  if (!completed.length) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(`\n[marketing:capture] ${sanitizeError(error)}`);
  process.exitCode = 1;
});
