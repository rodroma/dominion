/* Dominion Search service worker: precache the app + bundle, cache images at runtime. */
const VERSION = "v5";
const SHELL = `shell-${VERSION}`;
const IMAGES = `images-${VERSION}`;

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./styles.css",
  "./manifest.webmanifest",
  "./icon.svg",
  "./data/bundle.json",
  "./dist/core/index.js",
  "./dist/core/engine.js",
  "./dist/core/eval.js",
  "./dist/core/fields.js",
  "./dist/core/lexer.js",
  "./dist/core/parser.js",
  "./dist/core/ast.js",
  "./dist/core/bundle.js",
  "./dist/core/cost.js",
  "./dist/core/sets.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL && k !== IMAGES).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Card images from the wiki: cache-first, then network (cache-as-you-go).
  if (url.hostname === "dominionstrategy.miraheze.org") {
    event.respondWith(
      caches.open(IMAGES).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return hit || Response.error();
        }
      }),
    );
    return;
  }

  // Same-origin: cache-first so the app works fully offline.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return hit || Response.error();
        }
      }),
    );
  }
});
