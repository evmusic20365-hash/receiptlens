// Cache name is unique per SW install — forces a clean slate on every deploy
const CACHE = "receiptlens-" + Date.now();

const PRECACHE = [
  "/manifest.json",
  "/icon-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// Activate: nuke all caches from previous deploys, then take control immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept API routes
  if (url.pathname.startsWith("/api/")) return;

  // Never intercept Next.js build chunks — content-hashed, let browser cache handle them
  if (url.pathname.startsWith("/_next/static/")) return;

  // HTML pages: network-first so users always get the latest version, fall back to cached "/"
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Static shell assets (manifest, icons): cache-first
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
    )
  );
});
