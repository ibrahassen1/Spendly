// Never cache authentication traffic or Vite development assets.
// In development, unregister this worker and remove only its own caches.
const CACHE_NAME = 'spendly-v2';
const APP_SHELL = ['/manifest.webmanifest', '/favicon.svg'];
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(self.location.hostname);

self.addEventListener('install', (event) => {
  event.waitUntil(IS_LOCAL ? Promise.resolve() :
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('spendly-') && (IS_LOCAL || name !== CACHE_NAME)).map((name) => caches.delete(name)));
    if (IS_LOCAL) await self.registration.unregister();
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (IS_LOCAL || event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request));
    return;
  }
  // Only cache stable app icons/manifest, not JavaScript, auth or user data.
  if (!APP_SHELL.includes(url.pathname)) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
