import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brand } from "@/lib/brand";

function pngSize(path: string) {
  const buffer = readFileSync(path);
  expect(buffer.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe("červené logo StudentHub Brno", () => {
  it("používá verzované assety ve všech aktivních integračních bodech", () => {
    expect(brand.assets).toMatchObject({
      logo: "/brand/brno/studenthub-logo-v2.png",
      logoDark: "/brand/brno/studenthub-logo-dark-v2.png",
      icon192: "/brand/brno/studenthub-icon-v2-192.png",
      icon512: "/brand/brno/studenthub-icon-v2-512.png",
      maskable512: "/brand/brno/studenthub-icon-maskable-v2-512.png",
      appleTouch: "/brand/brno/studenthub-apple-touch-v2-180.png",
      openGraph: "/brand/brno/studenthub-og-v2.png",
    });
    const activeSources = ["app/layout.tsx", "lib/pwa-manifest.ts", "public/sw.js", "public/offline.html"].map((path) => readFileSync(path, "utf8")).join("\n");
    expect(activeSources).not.toMatch(/\/brand\/brno\/(?:icon|og|skyline-source)(?:-|\.)/);
  });

  it("má správné rozměry instalačních, Apple a Open Graph assetů", () => {
    expect(pngSize("public/brand/brno/studenthub-icon-v2-192.png")).toEqual({ width: 192, height: 192 });
    expect(pngSize("public/brand/brno/studenthub-icon-v2-512.png")).toEqual({ width: 512, height: 512 });
    expect(pngSize("public/brand/brno/studenthub-icon-maskable-v2-512.png")).toEqual({ width: 512, height: 512 });
    expect(pngSize("public/brand/brno/studenthub-apple-touch-v2-180.png")).toEqual({ width: 180, height: 180 });
    expect(pngSize("public/brand/brno/studenthub-og-v2.png")).toEqual({ width: 1200, height: 630 });
  });

  it("odděluje logo od barevného motivu Campus Indigo", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain("--primary: #4f46e5");
    expect(css).not.toContain("--brand-logo:");
    expect(css).toContain("background: transparent");
  });
});
