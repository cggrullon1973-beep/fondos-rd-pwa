/* Service worker: la app abre sin conexión y muestra los últimos datos guardados.
   Todo va primero a la red y usa lo guardado solo sin conexión: así la página, el CSS
   y el JS siempre son de la misma versión. Al cambiar archivos de la app, sube VERSION
   y el ?v= de index.html (y aquí en SHELL). */
const VERSION = 'inversiones-rd-v3';
const SHELL = ['./', 'index.html', 'css/app.css?v=3', 'js/shim.js?v=3', 'js/app.js?v=3', 'js/pwa.js?v=3', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request).then((m) => m || (e.request.mode === 'navigate' ? caches.match('index.html') : undefined))
    .then((m) => m || Response.error())));
});
