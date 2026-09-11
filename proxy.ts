import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authCookieOptions, copyResponseCookies, isSupabaseSessionCookie } from "@/lib/auth-cookies";
import { canonicalRedirectTarget, internalRouteForBrno, legacyPublicPath } from "@/lib/platform-routing";

const reservedTopLevelRoutes = new Set([
  "admin",
  "akce",
  "api",
  "auth",
  "brand",
  "brigady",
  "chat",
  "cookies",
  "hlidac",
  "kalendar",
  "kontakt",
  "komunita",
  "mendelu",
  "mista",
  "muni",
  "nabidky",
  "nastaveni",
  "navrhnout-obsah",
  "o-projektu",
  "podminky",
  "partak",
  "pomoc",
  "profil",
  "profily",
  "soukromi",
  "ucet",
  "vut",
  "_sites-preview",
]);

const removedAuthEndpoints = new Set(["/api/auth/google", "/api/auth/otp"]);

function publishedCitySlugs() {
  const defaultCity = process.env.DEFAULT_CITY_SLUG?.trim().toLowerCase() || "brno";
  if (process.env.MULTI_CITY_ENABLED !== "true") return new Set([defaultCity]);

  return new Set(
    (process.env.PUBLISHED_CITY_SLUGS || defaultCity)
      .split(",")
      .map((slug) => slug.trim().toLowerCase())
      .filter(Boolean),
  );
}

function cityNotFoundResponse() {
  return new NextResponse(
    `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Město není dostupné | StudentHub</title><style>:root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#f8fafc;color:#0f172a}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:#f8fafc}.card{width:min(560px,100%);padding:32px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;text-align:center;box-shadow:0 12px 32px rgba(15,23,42,.09)}.mark{width:58px;height:58px;margin:0 auto 18px;display:block;object-fit:contain}h1{margin:0 0 10px;font-size:28px}p{margin:0 0 22px;color:#64748b;line-height:1.6}a{min-height:42px;padding:10px 16px;display:inline-flex;align-items:center;border-radius:7px;background:#4f46e5;color:#fff;font-weight:800;text-decoration:none}@media(prefers-color-scheme:dark){:root,body{background:#0f172a;color:#f8fafc}.card{border-color:#273244;background:#111827}.card p{color:#cbd5e1}a{background:#818cf8;color:#020617}}</style></head><body><main class="card"><img class="mark" src="/brand/brno/studenthub-icon-v3-192.png" alt=""><h1>Tady nic není</h1><p>Tato městská edice není publikovaná. StudentHub je nyní veřejně dostupný pouze pro Brno.</p><a href="/brno">Přejít na StudentHub Brno</a></main></body></html>`,
    {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isInternalCityRewrite = request.headers.get("x-studenthub-city-rewrite") === "brno";

  if (removedAuthEndpoints.has(pathname)) {
    return NextResponse.json(
      { message: "Tato přihlašovací metoda není dostupná." },
      { status: 404, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } },
    );
  }

  const canonicalTarget = canonicalRedirectTarget(request.nextUrl.hostname, pathname);
  if (canonicalTarget) {
    const target = request.nextUrl.clone();
    target.protocol = "https:";
    target.hostname = canonicalTarget.hostname;
    target.port = "";
    target.pathname = canonicalTarget.pathname;
    const redirect = NextResponse.redirect(target, 308);
    redirect.headers.set("Cache-Control", "public, max-age=3600");
    return redirect;
  }

  if (!isInternalCityRewrite && pathname !== "/") {
    const canonicalPath = legacyPublicPath(pathname);
    if (canonicalPath !== pathname) {
      const target = request.nextUrl.clone();
      target.pathname = canonicalPath;
      const redirect = NextResponse.redirect(target, 308);
      redirect.headers.set("Cache-Control", "public, max-age=3600");
      return redirect;
    }
  }

  if (pathname === "/navrhnout-obsah" || pathname === "/navrhnout-obsah/") {
    const contactUrl = request.nextUrl.clone();
    contactUrl.pathname = "/kontakt";
    contactUrl.search = "";
    const response = NextResponse.redirect(contactUrl, 308);
    response.headers.set("Cache-Control", "public, max-age=3600");
    return response;
  }

  const internalRoute = internalRouteForBrno(pathname);
  const responseForRoute = () => {
    if (!internalRoute) return NextResponse.next({ request });
    const destination = request.nextUrl.clone();
    destination.pathname = internalRoute;
    const headers = new Headers(request.headers);
    headers.set("x-studenthub-city-rewrite", "brno");
    return NextResponse.rewrite(destination, { request: { headers } });
  };
  let response = responseForRoute();
  let verifiedUser = false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasSupabaseCookie = request.cookies.getAll().some((cookie) => isSupabaseSessionCookie(cookie.name));
  if (url && anon && hasSupabaseCookie) {
    const client = createServerClient(url, anon, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values) => {
          for (const { name, value } of values) request.cookies.set(name, value);
          response = responseForRoute();
          for (const { name, value, options } of values) response.cookies.set(name, value, authCookieOptions(options));
        },
      },
    });
    const { data } = await client.auth.getUser();
    verifiedUser = Boolean(data.user?.email_confirmed_at);
  }

  if (pathname.startsWith("/admin") && pathname !== "/admin/prihlaseni") {
    if (!verifiedUser) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/admin/prihlaseni";
      loginUrl.search = "?from=%2Fadmin";
      if (loginUrl.hostname === "127.0.0.1" || loginUrl.hostname === "localhost") loginUrl.protocol = "http:";
      const redirectResponse = NextResponse.redirect(loginUrl);
      redirectResponse.headers.set("Cache-Control", "private, no-store");
      return copyResponseCookies(response,redirectResponse);
    }
  }

  const firstSegment = pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  if (
    firstSegment &&
    !firstSegment.includes(".") &&
    !reservedTopLevelRoutes.has(firstSegment) &&
    !publishedCitySlugs().has(firstSegment)
  ) {
    return cityNotFoundResponse();
  }

  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
