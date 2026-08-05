export type PwaBrowser = "safari" | "chrome" | "edge" | "firefox" | "instagram" | "other";

export type PwaEnvironment = {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  standaloneDisplay?: boolean;
  navigatorStandalone?: boolean;
};

export type PwaInstallPlatform = "installed" | "ios" | "android" | "windows" | "desktop";

export function detectPwaBrowser(userAgent: string): PwaBrowser {
  if (/Instagram|FBAN|FBAV/i.test(userAgent)) return "instagram";
  if (/EdgA?|EdgiOS/i.test(userAgent)) return "edge";
  if (/CriOS|Chrome|Chromium/i.test(userAgent)) return "chrome";
  if (/FxiOS|Firefox/i.test(userAgent)) return "firefox";
  if (/Safari/i.test(userAgent)) return "safari";
  return "other";
}

export function isIosEnvironment(environment: PwaEnvironment) {
  return /iPad|iPhone|iPod/i.test(environment.userAgent)
    || (environment.platform === "MacIntel" && (environment.maxTouchPoints || 0) > 1);
}

export function detectPwaInstallPlatform(environment: PwaEnvironment): PwaInstallPlatform {
  if (environment.standaloneDisplay || environment.navigatorStandalone) return "installed";
  if (isIosEnvironment(environment)) return "ios";
  if (/Android/i.test(environment.userAgent)) return "android";
  if (/Windows/i.test(environment.userAgent)) return "windows";
  return "desktop";
}

export function pwaInstallGuide(environment: PwaEnvironment) {
  const platform = detectPwaInstallPlatform(environment);
  const browser = detectPwaBrowser(environment.userAgent);

  if (platform === "ios") {
    if (browser === "instagram") {
      return {
        title: "Nainstalovat StudentHub na iPhone nebo iPad",
        lead: "Nejprve otevři stránku v Safari pomocí nabídky prohlížeče Instagramu.",
        steps: ["V nabídce Instagramu zvol Otevřít v externím prohlížeči.", "V Safari otevři Sdílet.", "Vyber Přidat na plochu a potvrď Přidat."],
      };
    }
    return {
      title: "Nainstalovat StudentHub na iPhone nebo iPad",
      lead: "Otevři Sdílet a vyber Přidat na plochu.",
      steps: browser === "safari"
        ? ["Klepni na ikonu Sdílet v liště Safari.", "Vyber Přidat na plochu.", "Potvrď tlačítkem Přidat."]
        : ["Otevři nabídku Sdílet v prohlížeči.", "Vyber Přidat na plochu.", "Pokud volba chybí, otevři stránku v Safari a postup zopakuj."],
    };
  }

  if (browser === "instagram") {
    return {
      title: "Nainstalovat StudentHub",
      lead: "Instalaci dokonči v Chrome, Edge nebo Safari, ne uvnitř Instagramu.",
      steps: ["V nabídce Instagramu zvol Otevřít v externím prohlížeči.", "Otevři nabídku nového prohlížeče.", "Vyber Nainstalovat aplikaci nebo Přidat na plochu."],
    };
  }

  if (platform === "android") {
    return {
      title: "Nainstalovat StudentHub na Android",
      lead: "Otevři nabídku prohlížeče a vyber Nainstalovat aplikaci.",
      steps: ["V Chrome nebo Edge klepni na nabídku ⋮.", "Vyber Nainstalovat aplikaci nebo Přidat na plochu.", "Potvrď instalaci."],
    };
  }

  if (platform === "windows") {
    return {
      title: "Nainstalovat StudentHub ve Windows",
      lead: "V Chrome nebo Edge použij instalační položku v adresním řádku nebo nabídce.",
      steps: ["Otevři nabídku Chrome nebo Edge.", "Vyber Nainstalovat StudentHub Brno; v Edge může být pod položkou Aplikace.", "Potvrď instalaci."],
    };
  }

  return {
    title: "Nainstalovat StudentHub",
    lead: "Tento prohlížeč nenabídl automatickou instalaci.",
    steps: ["Otevři nabídku prohlížeče.", "Hledej Nainstalovat aplikaci nebo Přidat na plochu.", "Pokud volba chybí, otevři stránku v aktuálním Chrome, Edge nebo Safari."],
  };
}
