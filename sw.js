// Service worker: guarda la app para que abra sin conexión.
// Sube el número de versión al publicar cambios para que los móviles se actualicen.
const CACHE = 'monitor-bebe-v10';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './store.js', './config.js', './who.js', './voice.js', './meds.js', './ai.js',
  './manifest.webmanifest', './lib/firebase-app.js', './lib/firebase-auth.js', './lib/firebase-firestore.js',
  './lib/chart.umd.js', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Red primero (para recibir actualizaciones), caché si no hay conexión.
  e.respondWith(
    fetch(req, { cache: 'no-cache' }) // siempre comprueba con el servidor si hay versión nueva
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});

// Al tocar un aviso, abrir (o traer al frente) la app.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const c = list.find((x) => x.url.includes(self.registration.scope));
    return c ? c.focus() : self.clients.openWindow('./');
  }));
});
