// ============================================================
//  sw.js — Service Worker (Layer 2 interception)
//
//  IMPORTANT: This file must be placed at the ROOT of your
//  GitHub Pages repo — same folder as index.html.
//
//  ONLY THING YOU NEED TO CHANGE:
//  Paste your worker URL below (same one as in worker.js and index.html)
// ============================================================

const WORKER = 'https://quiet-sound-cc77.chrisjlove2022.workers.dev/';

// ─────────────────────────────────────────────────────────────
//  Nothing below this line needs to be changed
// ─────────────────────────────────────────────────────────────

const MY_ORIGIN = self.location.origin;

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Skip: requests to our own GitHub Pages origin (index.html, sw.js, etc.)
  if (url.startsWith(MY_ORIGIN)) return;

  // Skip: already going through the worker
  if (url.startsWith(WORKER)) return;

  // Skip: browser-internal schemes
  if (/^(blob|data|chrome-extension|moz-extension):/.test(url)) return;

  // Everything else: route through the worker
  e.respondWith(proxyThrough(e.request, url));
});

async function proxyThrough(original, targetUrl) {
  const proxied = `${WORKER}/?url=${encodeURIComponent(targetUrl)}`;

  try {
    const res = await fetch(proxied, {
      method: original.method === 'GET' ? 'GET' : original.method,
      headers: {
        // Only forward the Accept header — no cookies, no origin, no referer
        Accept: original.headers.get('Accept') || '*/*',
      },
      signal: AbortSignal.timeout(15000),
    });
    return res;
  } catch {
    // If the worker is unreachable, fall through to the original request
    // so the page at least partially loads rather than showing nothing
    return fetch(original);
  }
}
