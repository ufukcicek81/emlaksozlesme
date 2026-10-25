// Emlak Sözleşmem service worker: önce ağ, bağlantı yoksa önbellek (çevrimdışı açılış için).
const CACHE = "emlak-sozlesmem-20261025";
const CORE = ["./", "./index.html", "./assets/app.css?v=20261025", "./assets/app.js?v=20261025", "./tasdemir-sozlesme-logo.jpg", "./manifest.webmanifest?v=20261025", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => null)))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Firebase veri/kimlik istekleri asla önbelleğe alınmaz.
  if (url.hostname.endsWith("googleapis.com") || url.hostname.endsWith("firebaseio.com")) return;
  const cacheable = url.origin === self.location.origin || url.hostname === "www.gstatic.com" || url.hostname === "cdnjs.cloudflare.com";
  if (!cacheable) return;
  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then((res) => {
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match(req, { ignoreSearch: true })).then((r) => r || (req.mode === "navigate" ? caches.match("./index.html") : undefined)))
  );
});
