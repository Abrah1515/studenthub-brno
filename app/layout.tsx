import type { Metadata, Viewport } from "next";
import { CookieConsent } from "@/components/cookie-consent";
import { PwaRegister } from "@/components/pwa-register";
import { PwaInstallProvider } from "@/components/pwa-install";
import { FirstRunPicker } from "@/components/preference-picker";
import { PrivacyAnalytics } from "@/components/privacy-analytics";
import { Suspense } from "react";
import { FeatureTutorial } from "@/components/feature-tutorial";
import { SiteShell } from "@/components/site-shell";
import { brand } from "@/lib/brand";
import { getPublishedCities } from "@/lib/city-data";
import { getAcademicCatalog } from "@/lib/academic-catalog";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const siteUrl = brand.siteUrl;
const themeBootstrap = `(function(){
  function apply(preference,persist){
    if(preference!=='light'&&preference!=='dark'&&preference!=='system')preference='system';
    var dark=preference==='dark'||(preference==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme=dark?'dark':'light';
    document.documentElement.dataset.themePreference=preference;
    if(persist)localStorage.setItem('studenthub-theme',preference);
    var meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.setAttribute('content',dark?'${brand.colors.darkTheme}':'${brand.colors.lightTheme}');
  }
  try{apply(localStorage.getItem('studenthub-theme')||'system',false)}catch(e){}
  document.addEventListener('click',function(event){
    try{
      var origin=event.target instanceof Element?event.target:null;
      var control=origin&&origin.closest('[data-theme-option]');
      if(control)apply(control.getAttribute('data-theme-option')||'system',true);
    }catch(e){}
  },true);
})()`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: brand.seo.title, template: `%s | ${brand.editionName}` },
  description: brand.seo.description,
  applicationName: brand.editionName,
  verification: { google: "60df659d3c8fefaa" },
  alternates: { canonical: "/brno" },
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: brand.assets.icon192, sizes: "192x192", type: "image/png" }], apple: brand.assets.icon192 },
  appleWebApp: { capable: true, title: brand.editionName, statusBarStyle: "default" },
  openGraph: {
    type: "website",
    locale: "cs_CZ",
    siteName: brand.editionName,
    title: brand.seo.title,
    description: "Termíny, místa, brigády, komunita a studentská burza v jednom klidném přehledu.",
    images: [{ url: new URL(brand.assets.openGraph, siteUrl), width: 1734, height: 907, alt: `${brand.editionName} – termíny, místa, slevy a brigády` }],
  },
  twitter: { card: "summary_large_image", title: brand.editionName, description: `Praktický studentský přehled pro ${brand.editionShortName}.`, images: [new URL(brand.assets.openGraph, siteUrl)] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f3f7f5" }, { media: "(prefers-color-scheme: dark)", color: "#101915" }] };

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: brand.editionName,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  inLanguage: "cs",
  description: "Nezávislý praktický rozcestník pro studenty v Brně.",
  url: siteUrl,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [cities, catalog] = await Promise.all([getPublishedCities(), getAcademicCatalog()]);
  return (
    <html lang="cs" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body>
        <a className="skip-link" href="#hlavni-obsah">Přeskočit na obsah</a>
        <PwaInstallProvider>
          <SiteShell cities={cities} catalog={catalog}>{children}</SiteShell>
          <CookieConsent />
          <FirstRunPicker cities={cities} catalog={catalog} />
          <FeatureTutorial />
          <Suspense fallback={null}><PrivacyAnalytics /></Suspense>
          <PwaRegister />
        </PwaInstallProvider>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      </body>
    </html>
  );
}
