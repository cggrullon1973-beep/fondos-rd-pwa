/* Service worker: la app abre sin conexión y muestra los últimos datos guardados. */
const VERSION = 'inversiones-rd-v1';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/shim.js', 'js/app.js', 'js/pwa.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Datos y páginas: primero la red (para tener lo de hoy); si no hay conexión, lo guardado.
  if (url.pathname.includes('/data/') || e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request).then((m) => m || caches.match('index.html'))));
    return;
  }
  // Archivos de la app: lo guardado primero, y se refresca en segundo plano.
  e.respondWith(caches.match(e.request).then((m) => {
    const net = fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); } return r; });
    return m || net;
  }));
});
