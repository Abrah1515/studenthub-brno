export const productionSiteUrl = "https://studenthubapp.cz";

export function getPublicSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return productionSiteUrl;

  try {
    const url = new URL(configured);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return productionSiteUrl;
    return url.origin;
  } catch {
    return productionSiteUrl;
  }
}
