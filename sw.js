// Reflections service worker: makes the app open fast and keeps its screens available on a weak connection.
// Making songs and films always needs the internet.
const CACHE = 'reflections-v36';
const SHELL = ['./', './index.html', './app.html', './config.js', './manifest.webmanifest',
  './terms.html', './privacy.html',
  './assets/logo-sm.png', './assets/logo-track-sm.png', './assets/logo-track-lg.png', './assets/knob.png', './assets/knob-lg.png', './assets/real.jpg',
  './assets/poster.jpg', './assets/og-image.png',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || req.headers.has('range')) return;
  if (req.mode === 'navigate') {
    // pages: try the network first so updates show up, fall back to the saved copy offline
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match('./app.html'))));
    return;
  }
  // files: answer from the saved copy right away, refresh it in the background
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r.ok && !url.pathname.endsWith('.mp4')) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; })
      .catch(() => hit || Response.error());
    return hit || net;
  }));
});
