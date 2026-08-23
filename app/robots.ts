import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const base = getPublicSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/admin/",
        "/api",
        "/api/",
        "/ucet",
        "/ucet/",
        "/partak/moje",
        "/*/burza/novy",
        "/*/burza/overit",
        "/*/burza/sprava",
        "/akce/sprava",
        "/nastaveni",
        "/hlidac",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
