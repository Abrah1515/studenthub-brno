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

export const cityEditions: readonly CityEdition[] = [
  { name: "Brno", slug: "brno", logo: "/brand/cities/studenthub-brno-v1.png", logoDark: "/brand/cities/studenthub-brno-dark-v1.png", logoWidth: 391, logoHeight: 396, active: true, href: "/brno", statusLabel: "Dostupné" },
  { name: "Praha", slug: "praha", logo: "/brand/cities/studenthub-praha-v1.png", logoDark: "/brand/cities/studenthub-praha-dark-v1.png", logoWidth: 392, logoHeight: 396, active: false, statusLabel: "Připravujeme" },
  { name: "Ostrava", slug: "ostrava", logo: "/brand/cities/studenthub-ostrava-v1.png", logoDark: "/brand/cities/studenthub-ostrava-dark-v1.png", logoWidth: 393, logoHeight: 397, active: false, statusLabel: "Připravujeme" },
  { name: "Olomouc", slug: "olomouc", logo: "/brand/cities/studenthub-olomouc-v1.png", logoDark: "/brand/cities/studenthub-olomouc-dark-v1.png", logoWidth: 394, logoHeight: 397, active: false, statusLabel: "Připravujeme" },
] as const;

export function cityEditionBySlug(slug: string) {
  return cityEditions.find((city) => city.slug === slug);
}
