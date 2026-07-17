/* Prevod service worker — makes the app installable and lets the shell open offline.
   IMPORTANT: never cache API traffic (Netlify functions, Supabase, Azure) — those must be live.
   Bump CACHE whenever a SHELL asset changes, or clients keep the old copy. */
const CACHE = 'prevod-shell-v2';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Never intercept API / dynamic traffic — always go to network.
  if (
    url.pathname.startsWith('/.netlify/') ||
    url.hostname.includes('supabase') ||
    url.hostname.includes('anthropic') ||
    url.hostname.includes('microsoft') ||       // azure speech
    url.hostname.includes('jsdelivr')           // supabase lib CDN — let the browser cache it
  ) {
    return; // default browser fetch
  }

  // Only handle same-origin GET requests for the static shell.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Network-first for the HTML document (so updates show up), cache fallback offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
        }
        return res;
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache-first for other static assets (icons, manifest).
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }))
  );
});
