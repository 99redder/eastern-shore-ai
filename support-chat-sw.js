// Support Chat Service Worker
// Network-first strategy with skipWaiting/clients.claim for immediate updates

const CACHE_NAME = 'support-chat-v6';
const ASSETS_TO_CACHE = [
  '/support-chat.html',
  '/fonts.css',
  '/icons/support-chat/favicon-32.png',
  '/icons/support-chat/apple-touch-icon.png',
  '/icons/support-chat/icon-192.png',
  '/icons/support-chat/icon-512.png'
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

  // Skip API calls and non-GET requests - always go to network.
  // Cache Storage only supports GET keys; POST cache.put() throws and can break login flows.
  if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
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

// Push notifications must always show a visible notification. This is
// required for iPhone Home Screen web apps and keeps an alert on screen until
// the operator opens the PWA and acknowledges it there.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const sessionId = Number(payload.sessionId);
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) return;

  const url = payload.url || `/support-chat.html#session=${sessionId}`;
  event.waitUntil(self.registration.showNotification(payload.title || 'Customer needs help', {
    body: payload.body || 'A Survival Node customer is waiting for support. Tap to open the chat.',
    icon: '/icons/support-chat/icon-192.png',
    badge: '/icons/support-chat/icon-192.png',
    tag: `support-session-${sessionId}`,
    renotify: true,
    silent: false,
    requireInteraction: true,
    vibrate: [500, 180, 500, 180, 900],
    data: { sessionId, url }
  }));
});

// Opening a notification takes the operator to the exact session. The page's
// explicit Acknowledge Phone Alert button records acknowledgement in D1.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const sessionId = Number(data.sessionId);
  const url = data.url || (Number.isSafeInteger(sessionId) && sessionId > 0
    ? `/support-chat.html#session=${sessionId}`
    : '/support-chat.html');
  const target = new URL(url, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

// Listen for skip waiting message from page
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
