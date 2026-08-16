// Service worker for the PWA app-shell (Phase 5, brief §7a).
//
// WHAT THIS DOES: makes the app's JS/CSS/HTML/icons load with zero network,
// so reopening the installed PWA offline shows the actual app instead of a
// browser "no internet" error page.
//
// WHAT THIS DELIBERATELY DOES NOT DO: cache or intercept any Firestore
// traffic. That's entirely Firestore's own job, via the persistentLocalCache
// configured in src/lib/firebase.ts (Phase 0) -- this service worker only
// ever touches same-origin GET requests for the app shell itself (see the
// origin/method checks below), so it can never interfere with Firestore's
// own careful online/offline handling.
//
// CACHING STRATEGY, per resource type:
//   - Hashed JS/CSS/asset files (e.g. /assets/index-BAb_oen9.js): filenames
//     change on every build because they're content-hashed, so once cached
//     a given URL can never go stale -- cache-first, cache indefinitely.
//   - The HTML document itself (navigation requests, i.e. loading "/"):
//     this is server-rendered PER REQUEST (TanStack Start SSR via Cloudflare
//     Workers), so aggressively caching it could serve stale HTML while
//     online. Network-first instead: always try a fresh request first, and
//     only fall back to whatever's cached when the network genuinely isn't
//     reachable. A slightly-stale cached HTML shell is fine for this
//     purpose anyway -- the actual app DATA comes from Firestore's own
//     client-side cache after hydration, not from the HTML itself.

const CACHE_NAME = "app-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(["/", "/manifest.webmanifest"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never touch anything but plain same-origin GETs. This is what keeps
  // Firestore's own network traffic (firestore.googleapis.com etc.), any
  // write/POST-style request, and any other cross-origin call completely
  // untouched by this file.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    }),
  );
});
