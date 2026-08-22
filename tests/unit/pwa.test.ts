import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectPwaBrowser, detectPwaInstallPlatform, isIosEnvironment, pwaInstallGuide } from "@/lib/pwa-install";

describe("PWA instalace", () => {
  it("rozpozná nainstalovaný režim před platformou", () => {
    expect(detectPwaInstallPlatform({ userAgent: "Mozilla/5.0 (Windows NT 10.0)", standaloneDisplay: true })).toBe("installed");
  });

  it("rozpozná iPad, který se hlásí jako Mac", () => {
    const environment = { userAgent: "Mozilla/5.0 (Macintosh) Version/18.0 Mobile Safari/604.1", platform: "MacIntel", maxTouchPoints: 5 };
    expect(isIosEnvironment(environment)).toBe(true);
    expect(detectPwaInstallPlatform(environment)).toBe("ios");
    expect(pwaInstallGuide(environment).lead).toContain("Sdílet");
  });

  it("přizpůsobí návod Instagramu bez tvrzení o obchodu s aplikacemi", () => {
    const environment = { userAgent: "Mozilla/5.0 (iPhone) Instagram 350.0.0" };
    expect(detectPwaBrowser(environment.userAgent)).toBe("instagram");
    const guide = pwaInstallGuide(environment);
    expect(guide.lead).toContain("Safari");
    expect(guide.steps.join(" ")).toContain("externím prohlížeči");
    expect(guide.steps.join(" ")).not.toMatch(/App Store|Google Play/);
  });

  it("rozliší Android a Windows návody", () => {
    expect(detectPwaInstallPlatform({ userAgent: "Mozilla/5.0 (Linux; Android 15) Chrome/140" })).toBe("android");
    expect(pwaInstallGuide({ userAgent: "Mozilla/5.0 (Windows NT 10.0) Edg/140" }).steps.join(" ")).toContain("Aplikace");
  });

  it("TWA důvěru neváže na pevně uložený certifikát a web povoluje GPS jen sobě", () => {
    const assetLinks = readFileSync("app/.well-known/assetlinks.json/route.ts", "utf8");
    const security = readFileSync("next.config.ts", "utf8");
    expect(assetLinks).toContain("ANDROID_SHA256_CERT_FINGERPRINTS");
    expect(assetLinks).not.toMatch(/(?:[A-F0-9]{2}:){31}[A-F0-9]{2}/);
    expect(security).toContain("geolocation=(self)");
  });
});
