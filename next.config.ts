import type { NextConfig } from "next";
import { assertProductionConfiguration } from "./lib/runtime-config";

assertProductionConfiguration();

const isDevelopment = process.env.NODE_ENV !== "production";
const enforceHttps = process.env.APP_ENV === "production" || process.env.VERCEL_ENV === "production";
const scriptSrc = ["'self'", "'unsafe-inline'", ...(isDevelopment ? ["'unsafe-eval'"] : [])].join(" ");
const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(enforceHttps ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const noIndexHeaders = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
      { source: "/manifest.webmanifest", headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }] },
      { source: "/offline.html", headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }] },
      { source: "/admin/:path*", headers: noIndexHeaders },
      { source: "/api/:path*", headers: noIndexHeaders },
      { source: "/ucet/:path*", headers: noIndexHeaders },
      { source: "/partak/moje", headers: noIndexHeaders },
      { source: "/:city/burza/novy", headers: noIndexHeaders },
      { source: "/:city/burza/overit", headers: noIndexHeaders },
      { source: "/:city/burza/sprava", headers: noIndexHeaders },
      { source: "/akce/sprava", headers: noIndexHeaders },
      { source: "/nastaveni", headers: noIndexHeaders },
      { source: "/hlidac", headers: noIndexHeaders },
      { source: "/nabidky", headers: noIndexHeaders },
      { source: "/:city/nabidky", headers: noIndexHeaders },
    ];
  },
};
export default nextConfig;
