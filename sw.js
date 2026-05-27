// SAR·RESSO V9 — Service Worker
// Versión del caché — cambiar este valor fuerza actualización
const CACHE_VERSION = 'sarresso-v9-1';
const CACHE_STATIC  = `${CACHE_VERSION}-static`;
const CACHE_DYNAMIC = `${CACHE_VERSION}-dynamic`;

// Archivos a cachear inmediatamente al instalar
const STATIC_ASSETS = [
  '/',
  '/index.html',
  // Fuentes y estilos externos se cachean dinámicamente
];

// URLs que NUNCA se cachean (siempre requieren red)
const NETWORK_ONLY = [
  'supabase.co',
  'googleapis.com',
  'gstatic.com',
];

// ── INSTALL: cachear assets estáticos ────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Instalando SAR·RESSO offline cache...');
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Error cacheando estáticos:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: limpiar cachés viejas ──────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activando SAR·RESSO Service Worker...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('sarresso-') && k !== CACHE_STATIC && k !== CACHE_DYNAMIC)
          .map(k => {
            console.log('[SW] Eliminando caché vieja:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: estrategia según tipo de recurso ───────────────────
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // No interceptar requests a Supabase ni APIs externas
  if(NETWORK_ONLY.some(domain => url.includes(domain))) return;

  // No interceptar requests que no sean GET
  if(event.request.method !== 'GET') return;

  // No interceptar extensiones de Chrome
  if(url.startsWith('chrome-extension://')) return;

  // Estrategia: Cache First, con fallback a red y luego caché dinámica
  event.respondWith(
    caches.match(event.request).then(cached => {
      if(cached){
        // Servir desde caché y actualizar en background
        const fetchPromise = fetch(event.request).then(response => {
          if(response && response.status === 200 && response.type !== 'opaque'){
            const clone = response.clone();
            caches.open(CACHE_DYNAMIC).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => null);

        return cached;
      }

      // No está en caché — ir a la red
      return fetch(event.request).then(response => {
        if(!response || response.status !== 200) return response;

        // Cachear dinámicamente fuentes, scripts, CSS, HTML
        const ct = response.headers.get('content-type') || '';
        if(
          ct.includes('javascript') ||
          ct.includes('css') ||
          ct.includes('html') ||
          ct.includes('font') ||
          ct.includes('image')
        ){
          const clone = response.clone();
          caches.open(CACHE_DYNAMIC).then(cache => cache.put(event.request, clone));
        }

        return response;
      }).catch(() => {
        // Sin red y sin caché — intentar devolver index.html para rutas de la app
        if(event.request.headers.get('accept')?.includes('text/html')){
          return caches.match('/index.html');
        }
        return new Response('Sin conexión', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

// ── MENSAJE: forzar actualización desde la app ────────────────
self.addEventListener('message', event => {
  if(event.data === 'skipWaiting') self.skipWaiting();
});

console.log('[SW] SAR·RESSO Service Worker cargado v1');
