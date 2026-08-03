import type { MetadataRoute } from "next";
import type { City } from "@/lib/cities";
import { brand } from "@/lib/brand";

export function manifestForCity(city: City): MetadataRoute.Manifest {
  const editionName = String(city.brandConfig.editionName || `${brand.platformName} ${city.name}`);
  return { name: editionName, short_name: editionName, description: `Praktický studentský přehled pro ${city.name}.`, start_url: `/${city.slug}`, display: "standalone", background_color: brand.colors.lightTheme, theme_color: brand.colors.primary, lang: "cs", icons: [{ src: brand.assets.icon192, sizes: "192x192", type: "image/png" }, { src: brand.assets.icon512, sizes: "512x512", type: "image/png" }] };
}
