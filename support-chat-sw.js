// Support Chat Service Worker
// Network-first strategy with skipWaiting/clients.claim for immediate updates

const CACHE_NAME = 'support-chat-v1';
const ASSETS_TO_CACHE = [
  '/support-chat.html',
  '/fonts.css',
  '/favicon.svg'
];

// Install: cache essential assets
self.addEventListener('install', (event) => {
  // Skip waiting to activate immediately
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate: claim clients immediately and clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Claim all clients immediately
      self.clients.claim(),
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      })
    ])
  );
});

// Fetch: network-first strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Skip API calls - always go to network
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone response to cache
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Return offline fallback for HTML requests
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/support-chat.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// Listen for skip waiting message from page
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
