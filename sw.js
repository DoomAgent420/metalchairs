// ============================================================
//  sw.js — Service Worker (Layer 2 interception)
//  Place this file at the ROOT of your GitHub Pages repo.
//  Registered by index.html automatically.
//
//  This catches any network request that the injected runtime
//  JS (Layer 1) inside the proxied page misses — images loaded
//  via CSS, fonts, dynamic import(), WebSocket upgrades, etc.
// ============================================================

const WORKER = 'https://quiet-sound-cc77.chrisjlove2022.workers.dev/'; // <-- CHANGE THIS (same as index.html)
const MY_ORIGIN = self.location.origin;

// Our own assets that should NEVER be proxied
const OWN_PATHS = ['/sw.js', '/index.html', '/backend.js'];

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = req.url;

  // Skip: our own origin (GitHub Pages assets)
  if (url.startsWith(MY_ORIGIN)) return;

  // Skip: already routed through worker / fallback
  if (url.startsWith(WORKER)) return;

  // Skip: blob/data/chrome-extension schemes
  if (/^(blob|data|chrome-extension):/.test(url)) return;

  // Everything else: route through worker
  e.respondWith(proxyThrough(req, url));
});

async function proxyThrough(original, targetUrl) {
  const proxied = `${WORKER}/?url=${encodeURIComponent(targetUrl)}`;

  try {
    const res = await fetch(proxied, {
      method: original.method === 'GET' ? 'GET' : original.method,
      headers: {
        Accept: original.headers.get('Accept') || '*/*',
        // Don't forward cookies, origin, referer — that's the whole point
      },
      signal: AbortSignal.timeout(15000),
    });
    return res;
  } catch {
    // If worker is down, let the original request try directly
    // (at minimum the page partially loads vs nothing)
    return fetch(original);
  }
}