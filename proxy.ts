import { NextResponse, type NextRequest } from "next/server";

const reservedTopLevelRoutes = new Set([
  "admin",
  "akce",
  "api",
  "auth",
  "brand",
  "brigady",
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
    `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Město není dostupné | StudentHub Brno</title><style>:root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#f3f7f5;color:#14231e}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:#f3f7f5}.card{width:min(560px,100%);padding:32px;border:1px solid #cedbd5;border-radius:10px;background:#fff;text-align:center;box-shadow:0 12px 35px rgba(16,62,46,.09)}.mark{width:48px;height:48px;margin:0 auto 18px;display:grid;place-items:center;border-radius:9px;background:#0f7656;color:#fff;font-weight:900}h1{margin:0 0 10px;font-size:28px}p{margin:0 0 22px;color:#596b64;line-height:1.6}a{min-height:42px;padding:10px 16px;display:inline-flex;align-items:center;border-radius:7px;background:#0f7656;color:#fff;font-weight:800;text-decoration:none}@media(prefers-color-scheme:dark){:root,body{background:#101915;color:#edf6f1}.card{border-color:#2f413a;background:#17231e}.card p{color:#aebdb6}a{background:#57d2a5;color:#0a241b}}</style></head><body><main class="card"><div class="mark" aria-hidden="true">SH</div><h1>Tady nic není</h1><p>Tato městská edice není publikovaná. StudentHub je nyní veřejně dostupný pouze pro Brno.</p><a href="/brno">Přejít na StudentHub Brno</a></main></body></html>`,
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

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Odstraněná OAuth cesta musí i na Vercelu vracet skutečné 404, ne HTML
  // App Routeru s úspěšným stavem pro neznámý POST požadavek.
  if (pathname === "/api/auth/google") {
    return NextResponse.json(
      { message: "Tato přihlašovací metoda není dostupná." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  if (pathname.startsWith("/admin") && pathname !== "/admin/prihlaseni") {
    const hasDemo = Boolean(request.cookies.get("sh_admin"));
    const hasSupabase = request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
    if (!hasDemo && !hasSupabase) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/admin/prihlaseni";
      loginUrl.search = "?from=%2Fadmin";
      if (loginUrl.hostname === "127.0.0.1" || loginUrl.hostname === "localhost") loginUrl.protocol = "http:";
      const response = NextResponse.redirect(loginUrl);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
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

  return NextResponse.next();
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
