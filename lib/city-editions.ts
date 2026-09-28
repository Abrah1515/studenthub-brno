import { cityCatalog, isCityPublic } from "@/lib/cities";

export type CityEdition = {
  name: string;
  slug: string;
  logo: string;
  logoDark: string;
  logoWidth: number;
  logoHeight: number;
  active: boolean;
  href?: `/${string}`;
  statusLabel: "Dostupné" | "Připravujeme";
};

export const cityEditions: readonly CityEdition[] = cityCatalog.map((city) => ({
  name: city.name, slug: city.slug, logo: city.selectionLogo.light, logoDark: city.selectionLogo.dark,
  logoWidth: city.selectionLogo.width, logoHeight: city.selectionLogo.height,
  active: isCityPublic(city), ...(isCityPublic(city) ? { href: `/${city.slug}` as `/${string}` } : {}),
  statusLabel: isCityPublic(city) ? "Dostupné" : "Připravujeme",
}));

export function cityEditionBySlug(slug: string) {
  return cityEditions.find((city) => city.slug === slug);
}
