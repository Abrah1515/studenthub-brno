import type { MetadataRoute } from "next";
import type { City } from "@/lib/cities";
import { brand } from "@/lib/brand";

export function manifestForCity(city: City): MetadataRoute.Manifest {
  const editionName = String(city.brandConfig.editionName || `${brand.platformName} ${city.name}`);
  return {
    id: `/${city.slug}`,
    name: editionName,
    short_name: brand.platformName,
    description: `Praktický studentský přehled pro ${city.name}.`,
    start_url: `/${city.slug}`,
    scope: "/",
    display: "standalone",
    background_color: brand.colors.lightTheme,
    theme_color: brand.colors.primary,
    lang: "cs",
    categories: ["education", "utilities", "lifestyle"],
    icons: [
      { src: brand.assets.icon192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: brand.assets.icon512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/brno/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/brand/brno/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
