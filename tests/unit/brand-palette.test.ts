import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brand } from "@/lib/brand";

const css = readFileSync("app/globals.css", "utf8").toLowerCase();

function luminance(hex: string) {
  const channels = hex.replace("#", "").match(/.{2}/g)?.map((part) => Number.parseInt(part, 16) / 255) || [];
  const [red, green, blue] = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrast(foreground: string, background: string) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe("zlato-neutrální značka", () => {
  it("udržuje schválené barvy v jednom významovém systému", () => {
    for (const token of ["background", "surface", "surface-elevated", "primary", "primary-hover", "primary-subtle", "primary-foreground", "accent", "text", "text-secondary", "border", "focus-ring", "success", "warning", "error", "info"]) {
      expect(css).toContain(`--${token}:`);
    }
    expect(brand.colors).toEqual({ primary: "#B88918", lightTheme: "#F8FAFC", darkTheme: "#090D18" });
  });

  it("neobsahuje bývalé zelené značkové literály", () => {
    for (const legacy of ["#0b6b4d", "#07533c", "#0f664c", "#66d5aa", "#8ae3c0", "#17392e", "#f2f6f3", "#0e1714", "#15211d"]) {
      expect(css).not.toContain(legacy);
    }
  });

  it("splňuje WCAG AA pro text a stavové kombinace", () => {
    expect(contrast("#111827", "#B88918")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#111827", "#A98537")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#805D0E", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#64748B", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#F8FAFC", "#090D18")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#94A3B8", "#090D18")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#090D18", "#F2C94C")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#166534", "#DCFCE7")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#4ADE80", "#12351F")).toBeGreaterThanOrEqual(4.5);
  });
});
