/** Scope-relative shell cache: supports /xbet/, other project names and root sites. */
const CACHE_NAME = `xbet-shell-v4:${self.registration.scope}`;
const ASSETS = ['./', './index.html', './manifest.json', './app.bundle.js?v=2', './main.css?v=2', './logo.svg', './icon-192.png', './icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS.map(path => new URL(path, self.registration.scope).href))));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('xbet-shell-') && key.endsWith(`:${self.registration.scope}`) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (event.request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname) || /\/(api|ws)(\/|$)/.test(url.pathname)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const clone = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)));
    }
    return response;
  }).catch(async () => (await caches.match(event.request)) || (event.request.mode === 'navigate' ? await caches.match(new URL('./index.html', scope).href) : null) || new Response('Offline', {status:503})));
});
