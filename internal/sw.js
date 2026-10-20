const CACHE = 'kumtsu-all-assets-v1';
const ASSETS = ['/internal/pwa/icon-192.png', '/internal/pwa/icon-512.png', '/internal/pwa/apple-touch-icon.png', '/internal/pwa/offline.html'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('kumtsu-all-assets-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (ASSETS.includes(url.pathname) && !url.search) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
  } else if (event.request.mode === 'navigate' && url.pathname.startsWith('/internal/')) {
    // Never persist authenticated HTML, API responses, tokens, or employee data.
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => caches.match('/internal/pwa/offline.html')));
  }
});
