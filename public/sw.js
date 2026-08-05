const STATIC_CACHE = "studenthub-static-v2";
const OFFLINE_PAGE = "/offline.html";
const PRECACHE = [
  OFFLINE_PAGE,
  "/brand/brno/icon-192.png",
  "/brand/brno/icon-512.png",
  "/brand/brno/icon-maskable-192.png",
  "/brand/brno/icon-maskable-512.png",
];
const PRIVATE_PREFIXES = ["/admin", "/api", "/auth", "/ucet", "/pomoc/moje", "/partak/moje"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isPrivatePath(pathname) {
  return PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isVersionedStaticAsset(request, url) {
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname.startsWith("/brand/") && request.destination === "image") return true;
  return ["style", "script", "font"].includes(request.destination);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || isPrivatePath(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_PAGE)));
    return;
  }

  if (!isVersionedStaticAsset(request, url)) return;
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (!response.ok || response.type !== "basic" || response.headers.get("Cache-Control")?.includes("no-store")) return response;
      const copy = response.clone();
      event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy)));
      return response;
    })),
  );
});
