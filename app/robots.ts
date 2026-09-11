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
        "/brno/partak/moje",
        "/*/burza/novy",
        "/*/burza/overit",
        "/*/burza/sprava",
        "/brno/akce/sprava",
        "/brno/nastaveni",
        "/brno/hlidac",
        "/brno/chat",
        "/brno/chat/",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
