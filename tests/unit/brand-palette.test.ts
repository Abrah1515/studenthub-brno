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

describe("Campus Indigo značka", () => {
  it("udržuje schválené barvy v jednom významovém systému", () => {
    for (const token of ["background", "surface", "surface-muted", "surface-elevated", "primary", "primary-hover", "primary-bright", "primary-soft", "primary-ultra-soft", "primary-action", "primary-action-hover", "primary-foreground", "accent", "text", "text-secondary", "text-muted", "border", "focus-ring", "brand-green", "brand-green-strong", "success", "warning", "error", "info"]) {
      expect(css).toContain(`--${token}:`);
    }
    expect(brand.colors).toEqual({ primary: "#4F46E5", lightTheme: "#F8FAFC", darkTheme: "#0F172A", logoGreen: "#22C55E" });
  });

  it("neobsahuje bývalé zlaté ani dominantní zelené značkové literály", () => {
    for (const legacy of ["#b88918", "#9a7214", "#a98537", "#fff6d8", "#d4a72c", "#f2c94c", "#ffd966", "#3a3215", "#d6a928", "#805d0e", "#0b6b4d", "#07533c", "#0f664c", "#66d5aa", "#8ae3c0", "#17392e", "#f2f6f3", "#0e1714", "#15211d"]) {
      expect(css).not.toContain(legacy);
    }
  });

  it("splňuje WCAG AA pro text a stavové kombinace", () => {
    expect(contrast("#FFFFFF", "#4F46E5")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#FFFFFF", "#4338CA")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#4338CA", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#64748B", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#F8FAFC", "#0F172A")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#CBD5E1", "#111827")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#A5B4FC", "#111827")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#020617", "#818CF8")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#166534", "#DCFCE7")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#4ADE80", "#12351F")).toBeGreaterThanOrEqual(4.5);
  });

  it("nepoužívá dekorativní gradient ani barevnou kouli v hlavním dashboardu", () => {
    expect(css).not.toContain("linear-gradient(");
    expect(css).not.toContain("radial-gradient(");
    expect(css).toContain(".countdown-card::after { content: none; }");
  });
});
