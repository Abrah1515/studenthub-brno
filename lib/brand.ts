export const brand = {
  platformName: "StudentHub",
  editionName: "StudentHub Brno",
  editionShortName: "Brno",
  defaultCitySlug: process.env.DEFAULT_CITY_SLUG || process.env.NEXT_PUBLIC_DEFAULT_CITY_SLUG || "brno",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "studenthubbrno@gmail.com",
  partnerEmail: process.env.NEXT_PUBLIC_PARTNER_EMAIL || "studenthubbrno@gmail.com",
  assets: {
    icon192: "/brand/brno/icon-192.png",
    icon512: "/brand/brno/icon-512.png",
    openGraph: "/brand/brno/og.png",
  },
  legacyAssets: { icon192: "/icon-192.png", icon512: "/icon-512.png", openGraph: "/og.png" },
  colors: { primary: "#0b6b4d", lightTheme: "#f3f7f5", darkTheme: "#101915" },
  seo: {
    title: "StudentHub Brno – prakticky pro studenty",
    description: "Nezávislý praktický rozcestník pro studenty v Brně: termíny, místa, brigády, komunita a studentská burza.",
  },
} as const;

export const independentNotice = "StudentHub Brno je nezávislý studentský projekt a není oficiální službou žádné vysoké školy.";
