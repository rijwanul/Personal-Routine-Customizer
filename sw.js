/* Service worker: caches the app shell so the routine works fully offline.
   Data itself lives in localStorage (see app.js), not here. */

const CACHE_NAME = 'routine-customizer-v9';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './auth.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event)=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(()=> self.skipWaiting())
  );
});

self.addEventListener('activate', (event)=>{
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(()=> self.clients.claim())
  );
});

// Cache-first for app shell, network-first fallback for everything else (e.g. CDN fonts/icons/export libs)
self.addEventListener('fetch', (event)=>{
  const req = event.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  if(isSameOrigin){
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then(cached => cached || fetch(req).then(res=>{
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        return res;
      }).catch(()=> caches.match('./index.html')))
    );
  } else {
    // Fonts / lucide / export libraries: try network, fall back to cache if offline
    event.respondWith(
      fetch(req).then(res=>{
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        return res;
      }).catch(()=> caches.match(req))
    );
  }
});
