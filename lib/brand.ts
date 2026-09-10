export const brand = {
  platformName: "StudentHub",
  editionName: "StudentHub Brno",
  editionShortName: "Brno",
  defaultCitySlug: process.env.DEFAULT_CITY_SLUG || process.env.NEXT_PUBLIC_DEFAULT_CITY_SLUG || "brno",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "studenthubbrno@gmail.com",
  partnerEmail: process.env.NEXT_PUBLIC_PARTNER_EMAIL || "studenthubbrno@gmail.com",
  assets: {
    logo: "/brand/brno/studenthub-logo-v2.png",
    logoDark: "/brand/brno/studenthub-logo-dark-v2.png",
    symbol: "/brand/brno/studenthub-symbol-v2.png",
    icon192: "/brand/brno/studenthub-icon-v2-192.png",
    icon512: "/brand/brno/studenthub-icon-v2-512.png",
    maskable192: "/brand/brno/studenthub-icon-maskable-v2-192.png",
    maskable512: "/brand/brno/studenthub-icon-maskable-v2-512.png",
    appleTouch: "/brand/brno/studenthub-apple-touch-v2-180.png",
    favicon16: "/brand/brno/studenthub-favicon-v2-16.png",
    favicon32: "/brand/brno/studenthub-favicon-v2-32.png",
    favicon48: "/brand/brno/studenthub-favicon-v2-48.png",
    openGraph: "/brand/brno/studenthub-og-v2.png",
  },
  colors: { primary: "#4F46E5", lightTheme: "#F8FAFC", darkTheme: "#0F172A" },
  seo: {
    title: "StudentHub Brno – prakticky pro studenty",
    description: "Nezávislý praktický rozcestník pro studenty v Brně: termíny, místa, brigády, komunita a studentská burza.",
  },
} as const;

export const independentNotice = "StudentHub Brno je nezávislý studentský projekt a není oficiální službou žádné vysoké školy.";
