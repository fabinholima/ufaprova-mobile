// Service worker do UFA Prova. Guarda somente os arquivos públicos do próprio
// aplicativo (HTML, scripts com hash, ícones) para abrir mais rápido e sem rede.
// Nunca intercepta a API nem outra origem: notas, fotos de cartões, listas de
// alunos e sessões não entram no cache.
const CACHE = 'ufaprova-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function cacheable(response) {
  return response.ok && response.type === 'basic' && !/no-store|private/.test(response.headers.get('cache-control') || '');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    // Página sempre da rede quando houver conexão, para receber a versão nova.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (cacheable(response)) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put('/', copy)); }
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  if (url.pathname.startsWith('/_expo/static/') || SHELL.includes(url.pathname) || /\.(png|ico|ttf|woff2?)$/.test(url.pathname)) {
    // Arquivos com hash no nome não mudam: cache primeiro.
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (cacheable(response)) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(request, copy)); }
        return response;
      })),
    );
  }
});
