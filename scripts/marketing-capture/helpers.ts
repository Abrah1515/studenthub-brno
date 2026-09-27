import { spawn } from "node:child_process";
import { access, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import ffmpegPathImport from "ffmpeg-static";
import type { Locator, Page } from "@playwright/test";
import type { ScreenshotInfo, VideoInfo } from "./types.ts";

export const viewport = { width: 432, height: 768 } as const;
export const outputSize = { width: 1080, height: 1920 } as const;

export class CaptureSkippedError extends Error {
  readonly privacySensitive: boolean;

  constructor(message: string, privacySensitive = false) {
    super(message);
    this.name = "CaptureSkippedError";
    this.privacySensitive = privacySensitive;
  }
}

export function pause(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function ensureDirectory(directory: string) {
  await mkdir(directory, { recursive: true });
}

export function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/(access[_-]?token|refresh[_-]?token|authorization|apikey|password)=?[^\s&]*/gi, "$1=[redacted]")
    .slice(0, 1_500);
}

export function urlFor(baseUrl: string, route: string) {
  return new URL(route, `${baseUrl}/`).toString();
}

export function utmUrl(destinationUrl: string, medium: "organic" | "paid_social", content: string) {
  const url = new URL(destinationUrl);
  url.searchParams.set("utm_source", "instagram");
  url.searchParams.set("utm_medium", medium);
  url.searchParams.set("utm_campaign", "brno_launch");
  url.searchParams.set("utm_content", content);
  return url.toString();
}

export async function dismissCommonOverlays(page: Page) {
  const consent = page.getByTestId("cookie-consent");
  if (await consent.isVisible().catch(() => false)) {
    const reject = consent.getByRole("button", { name: "Odmítnout volitelné" });
    if (await reject.isVisible().catch(() => false)) await reject.click();
  }

  const picker = page.getByTestId("first-run-picker");
  if (await picker.isVisible().catch(() => false)) {
    const continueWithoutSchool = picker.getByRole("button", { name: /Pokračovat vědomě/ });
    if (await continueWithoutSchool.isVisible().catch(() => false)) await continueWithoutSchool.click();
  }

  const tutorialIntro = page.getByTestId("tutorial-intro");
  if (await tutorialIntro.isVisible().catch(() => false)) {
    const close = tutorialIntro.getByRole("button", { name: /Rozumím|Přeskočit/ }).first();
    if (await close.isVisible().catch(() => false)) await close.click();
  }
}

export async function waitForStablePage(page: Page, heading: RegExp) {
  await page.locator("main").waitFor({ state: "visible", timeout: 20_000 });
  await dismissCommonOverlays(page);
  await page.getByRole("heading", { name: heading, level: 1 }).waitFor({ state: "visible", timeout: 15_000 });

  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.images].filter((image) => image.loading !== "lazy" || image.getBoundingClientRect().top < innerHeight * 1.5);
    await Promise.race([
      Promise.all(images.map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      }))),
      new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
    ]);
  });

  await page.waitForFunction(() => {
    const pending = document.querySelectorAll(".housing-skeleton,.loading-inline,.skeleton");
    return [...pending].every((element) => {
      const style = getComputedStyle(element);
      return style.display === "none" || style.visibility === "hidden" || !(element as HTMLElement).offsetParent;
    });
  }, undefined, { timeout: 8_000 }).catch(() => undefined);

  let previousHeight = -1;
  let stableSamples = 0;
  for (let attempt = 0; attempt < 8 && stableSamples < 3; attempt += 1) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    stableSamples = height === previousHeight ? stableSamples + 1 : 0;
    previousHeight = height;
    await pause(250);
  }

  const state = await page.evaluate(() => ({
    title: document.title,
    text: document.querySelector("main")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 600) || "",
  }));
  if (!state.text || /Tady nic není|Application error|Internal Server Error|404\b/i.test(`${state.title} ${state.text}`)) {
    throw new Error(`Stránka není použitelná: ${state.title || "bez titulku"}`);
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await pause(700);
}

export async function smoothScrollBy(page: Page, distance: number, duration = 1_400) {
  await page.evaluate(({ distance: delta, duration: milliseconds }) => new Promise<void>((resolve) => {
    const start = window.scrollY;
    const maximum = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    const target = Math.max(0, Math.min(maximum, start + delta));
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / milliseconds);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      window.scrollTo(0, start + (target - start) * eased);
      if (progress < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  }), { distance, duration });
}

export async function smoothScrollTo(page: Page, locator: Locator, duration = 1_400, topPadding = 80) {
  if (!await locator.count()) return false;
  const target = await locator.first().evaluate((element, padding) => {
    const rect = element.getBoundingClientRect();
    return Math.max(0, window.scrollY + rect.top - Number(padding));
  }, topPadding);
  const distance = target - await page.evaluate(() => window.scrollY);
  await smoothScrollBy(page, distance, duration);
  return true;
}

export function containsSensitiveContact(text: string) {
  const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const czechPhone = /(?:\+420|00420)\s*(?:\d[\s.-]*){9}\b|\b[67]\d{2}[\s.-]+\d{3}[\s.-]+\d{3}\b/;
  return email.test(text) || czechPhone.test(text);
}

export async function assertCardsDoNotExposeContact(locator: Locator) {
  const texts = await locator.allTextContents();
  if (texts.some(containsSensitiveContact)) {
    throw new CaptureSkippedError("Veřejný obsah obsahuje e-mail nebo telefon; flow bylo kvůli soukromí přeskočeno.", true);
  }
}

export async function pageContainsSensitiveContact(page: Page) {
  const text = await page.locator("main").textContent().catch(() => "");
  return containsSensitiveContact(text || "");
}

export async function validatePng(filePath: string): Promise<ScreenshotInfo> {
  const [buffer, file] = await Promise.all([readFile(filePath), stat(filePath)]);
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a" || buffer.length < 24) throw new Error("Screenshot není platný PNG soubor.");
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== outputSize.width || height !== outputSize.height) {
    throw new Error(`Screenshot má ${width}×${height}, očekáváno ${outputSize.width}×${outputSize.height}.`);
  }
  if (file.size < 5_000) throw new Error("Screenshot je podezřele malý nebo prázdný.");
  return { width, height, sizeBytes: file.size };
}

type ProcessResult = { code: number; stdout: string; stderr: string };

async function runProcess(command: string, args: string[], allowNonZero = false): Promise<ProcessResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("exit", (code) => {
      const result = { code: code ?? 1, stdout, stderr };
      if (!allowNonZero && code !== 0) reject(new Error(`FFmpeg skončil s kódem ${code ?? "?"}: ${stderr.slice(-2_000)}`));
      else resolve(result);
    });
  });
}

export async function resolveFfmpegPath() {
  if (!ffmpegPathImport) throw new Error("ffmpeg-static neposkytl cestu k binárce.");
  await access(ffmpegPathImport);
  return ffmpegPathImport;
}

export async function convertWebmToMp4(input: string, output: string, trimStartSeconds: number, durationSeconds: number) {
  const ffmpeg = await resolveFfmpegPath();
  await runProcess(ffmpeg, [
    "-hide_banner", "-loglevel", "warning", "-y", "-i", input,
    "-ss", trimStartSeconds.toFixed(3), "-t", durationSeconds.toFixed(3),
    "-an", "-vf", `scale=${outputSize.width}:${outputSize.height}:flags=lanczos,setsar=1`,
    "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", output,
  ]);
}

function parseDuration(value: string) {
  const match = value.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  return Number(match[1]) * 3_600 + Number(match[2]) * 60 + Number(match[3]);
}

export async function validateVideo(filePath: string): Promise<VideoInfo> {
  const ffmpeg = await resolveFfmpegPath();
  const probe = await runProcess(ffmpeg, ["-hide_banner", "-i", filePath], true);
  const videoLine = probe.stderr.split(/\r?\n/).find((line) => line.includes("Video:")) || "";
  const dimension = videoLine.match(/\b(\d{3,5})x(\d{3,5})\b/);
  const durationSeconds = parseDuration(probe.stderr);
  const file = await stat(filePath);
  const codec = /Video:\s*h264\b/i.test(videoLine) ? "h264" : (videoLine.match(/Video:\s*([^,\s]+)/i)?.[1] || "unknown");
  const width = Number(dimension?.[1] || 0);
  const height = Number(dimension?.[2] || 0);

  if (codec !== "h264") throw new Error(`Video nemá H.264 codec (${codec}).`);
  if (width !== outputSize.width || height !== outputSize.height || height <= width) {
    throw new Error(`Video má neplatné rozlišení ${width}×${height}.`);
  }
  if (durationSeconds <= 0 || durationSeconds > 20) throw new Error(`Video má neplatnou délku ${durationSeconds.toFixed(2)} s.`);
  if (file.size < 20_000) throw new Error("Video je podezřele malé nebo prázdné.");

  await runProcess(ffmpeg, ["-v", "error", "-i", filePath, "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-"]);
  return { codec, width, height, durationSeconds: Number(durationSeconds.toFixed(2)), sizeBytes: file.size };
}

export async function createMontage(inputs: string[], output: string) {
  if (inputs.length < 2) throw new Error("Overview potřebuje alespoň dva hotové zdrojové klipy.");
  const ffmpeg = await resolveFfmpegPath();
  const selected = inputs.slice(0, 6);
  const args = ["-hide_banner", "-loglevel", "warning", "-y"];
  for (const input of selected) args.push("-ss", "0.600", "-t", "2.000", "-i", input);
  const chains = selected.map((_, index) => `[${index}:v]setpts=PTS-STARTPTS[v${index}]`).join(";");
  const streams = selected.map((_, index) => `[v${index}]`).join("");
  args.push(
    "-filter_complex", `${chains};${streams}concat=n=${selected.length}:v=1:a=0[outv]`,
    "-map", "[outv]", "-an", "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", output,
  );
  await runProcess(ffmpeg, args);
}

export function relativePath(root: string, filePath: string) {
  return path.relative(root, filePath).split(path.sep).join("/");
}
