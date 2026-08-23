const STATIC_CACHE = "studenthub-static-v5";
const OFFLINE_PAGE = "/offline.html";
const PRECACHE = [
  OFFLINE_PAGE,
  "/brand/brno/icon-192.png",
  "/brand/brno/icon-512.png",
  "/brand/brno/icon-maskable-192.png",
  "/brand/brno/icon-maskable-512.png",
];
const PRIVATE_PREFIXES = ["/admin", "/api", "/auth", "/ucet", "/partak/moje"];

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
  return PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) || /^\/[^/]+\/burza\/(novy|overit|sprava)(?:\/|$)/.test(pathname);
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
  event.respondWith(fetch(request).then((response) => {
    if (!response.ok || response.type !== "basic" || response.headers.get("Cache-Control")?.includes("no-store")) return response;
    const copy = response.clone();
    event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy)));
    return response;
  }).catch(() => caches.match(request)));
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: "StudentHub", body: event.data.text(), url: "/hlidac" }; }
  event.waitUntil(self.registration.showNotification(payload.title || "StudentHub", {
    body: payload.body || "Máte nové upozornění.", icon: "/brand/brno/icon-192.png", badge: "/brand/brno/icon-maskable-192.png",
    tag: payload.tag || "studenthub-notification", data: { url: payload.url || "/hlidac" }, renotify: false,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || "/hlidac", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url.startsWith(self.location.origin));
    if (existing) { existing.navigate(destination); return existing.focus(); }
    return self.clients.openWindow(destination);
  }));
});
