import type { Metadata, Viewport } from "next";
import { CookieConsent } from "@/components/cookie-consent";
import { PwaRegister } from "@/components/pwa-register";
import { PwaInstallProvider } from "@/components/pwa-install";
import { FirstRunPicker } from "@/components/preference-picker";
import { PrivacyAnalytics } from "@/components/privacy-analytics";
import { Suspense } from "react";
import { FeatureTutorial } from "@/components/feature-tutorial";
import { TestModeNotice } from "@/components/test-mode-notice";
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
  title: { default: "StudentHub | Studentský život ve tvém městě", template: "%s | StudentHub" },
  description: "StudentHub spojuje studentské termíny, užitečná místa, komunitu a praktické služby podle města.",
  applicationName: brand.platformName,
  verification: { google: "60df659d3c8fefaa" },
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: brand.assets.favicon16, sizes: "16x16", type: "image/png" },
      { url: brand.assets.favicon32, sizes: "32x32", type: "image/png" },
      { url: brand.assets.favicon48, sizes: "48x48", type: "image/png" },
      { url: brand.assets.icon192, sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: brand.assets.appleTouch, sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: brand.editionName, statusBarStyle: "default" },
  openGraph: {
    type: "website",
    locale: "cs_CZ",
    siteName: brand.platformName,
    title: "StudentHub | Studentský život ve tvém městě",
    description: "Termíny, místa, komunita a praktické studentské služby přehledně podle města.",
    url: "/",
    images: [{ url: new URL("/brand/cities/studenthub-cities-og-v1.png", siteUrl), width: 1200, height: 630, alt: "StudentHub – Brno, Praha, Ostrava a Olomouc" }],
  },
  twitter: { card: "summary_large_image", title: "StudentHub", description: "Studentský život přehledně podle města.", images: [new URL("/brand/cities/studenthub-cities-og-v1.png", siteUrl)] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: light)", color: brand.colors.lightTheme }, { media: "(prefers-color-scheme: dark)", color: brand.colors.darkTheme }] };

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: brand.platformName,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  inLanguage: "cs",
  description: "Nezávislý studentský rozcestník s městskými edicemi.",
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
          <TestModeNotice />
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
