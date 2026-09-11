export const canonicalHost = "studenthubapp.cz";
export const legacyProductionHosts = new Set(["studenthub-brno.vercel.app"]);

const globalInfrastructurePrefixes = [
  "/admin",
  "/api",
  "/auth",
  "/_next",
  "/.well-known",
];

const cityScopedPrefixes = [
  "/komunita",
  "/partak",
  "/chat",
  "/hlidac",
  "/nastaveni",
  "/profily",
  "/profil",
  "/akce/sprava",
] as const;

const legacyCitySectionPrefixes = [
  "/kalendar",
  "/mista",
  "/brigady",
  "/burza",
  "/nabidky",
  ...cityScopedPrefixes,
] as const;

const legacySchoolRoutes = new Map([
  ["/muni", "/brno/skoly/muni"],
  ["/vut", "/brno/skoly/vut"],
  ["/mendelu", "/brno/skoly/mendelu"],
]);

function isPathOrChild(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isInfrastructurePath(pathname: string) {
  return globalInfrastructurePrefixes.some((prefix) => isPathOrChild(pathname, prefix));
}

export function legacyPublicPath(pathname: string) {
  if (pathname === "/") return "/brno";
  for (const [legacy, canonical] of legacySchoolRoutes) {
    if (isPathOrChild(pathname, legacy)) return `${canonical}${pathname.slice(legacy.length)}`;
  }
  if (legacyCitySectionPrefixes.some((prefix) => isPathOrChild(pathname, prefix))) return `/brno${pathname}`;
  return pathname;
}

export function internalRouteForBrno(pathname: string) {
  if (!pathname.startsWith("/brno/")) return null;
  const unscoped = pathname.slice("/brno".length);
  return cityScopedPrefixes.some((prefix) => isPathOrChild(unscoped, prefix)) ? unscoped : null;
}

export function canonicalRedirectTarget(hostname: string, pathname: string) {
  const normalizedHost = hostname.toLowerCase().split(":")[0];
  if (normalizedHost === `www.${canonicalHost}`) return { hostname: canonicalHost, pathname };
  if (!legacyProductionHosts.has(normalizedHost) || isInfrastructurePath(pathname)) return null;
  return { hostname: canonicalHost, pathname: legacyPublicPath(pathname) };
}

export function scopedBrnoHref(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized === "/brno" || normalized.startsWith("/brno/") ? normalized : `/brno${normalized}`;
}
