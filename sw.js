// Another Life service worker: works offline, updates in the background.
const CACHE = 'another-life-202611050253';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // The game page: try the network first so updates arrive, fall back to the cached copy offline.
  if (req.mode === 'navigate' || (url.origin === location.origin && url.pathname.endsWith('/index.html'))) {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  // Everything else (icons, the pixel font): cache first.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok && (url.origin === location.origin || url.host.endsWith('fonts.googleapis.com') || url.host.endsWith('fonts.gstatic.com'))) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});
