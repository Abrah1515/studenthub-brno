export const brand = {
  platformName: "StudentHub",
  editionName: "StudentHub Brno",
  editionShortName: "Brno",
  defaultCitySlug: process.env.DEFAULT_CITY_SLUG || process.env.NEXT_PUBLIC_DEFAULT_CITY_SLUG || "brno",
  // Veřejná identita a SEO canonical nesmí ukazovat na lokální vývojový server.
  // Runtime callbacky/API si nadále berou origin z požadavku nebo prostředí.
  siteUrl: "https://studenthubapp.cz",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "studenthubbrno@gmail.com",
  partnerEmail: process.env.NEXT_PUBLIC_PARTNER_EMAIL || "studenthubbrno@gmail.com",
  assets: {
    logo: "/brand/brno/studenthub-logo-v3.png",
    logoDark: "/brand/brno/studenthub-logo-dark-v3.png",
    symbol: "/brand/brno/studenthub-symbol-v3.png",
    icon192: "/brand/brno/studenthub-icon-v3-192.png",
    icon512: "/brand/brno/studenthub-icon-v3-512.png",
    maskable192: "/brand/brno/studenthub-icon-maskable-v3-192.png",
    maskable512: "/brand/brno/studenthub-icon-maskable-v3-512.png",
    appleTouch: "/brand/brno/studenthub-apple-touch-v3-180.png",
    favicon16: "/brand/brno/studenthub-favicon-v3-16.png",
    favicon32: "/brand/brno/studenthub-favicon-v3-32.png",
    favicon48: "/brand/brno/studenthub-favicon-v3-48.png",
    openGraph: "/brand/brno/studenthub-og-v3.png",
  },
  colors: { primary: "#4F46E5", lightTheme: "#F8FAFC", darkTheme: "#0F172A" },
  seo: {
    title: "StudentHub Brno – prakticky pro studenty",
    description: "Nezávislý praktický rozcestník pro studenty v Brně: termíny, místa, brigády, komunita a studentská burza.",
  },
} as const;

export const independentNotice = "StudentHub Brno je nezávislý studentský projekt a není oficiální službou žádné vysoké školy.";
