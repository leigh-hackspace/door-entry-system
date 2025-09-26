const CACHE_NAME = 'door-entry-management-system-[VERSION]';
const ASSETS = [
  '/',
  '/favicon.ico',
  '/js/app.js?v=[VERSION]',
  '/css/bootstrap.css?v=[VERSION]',
  '/css/index.css?v=[VERSION]',
  '/css/app.css?v=[VERSION]',
];

// Install event: caching assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker] Caching app shell');
      return cache.addAll(ASSETS);
    })
  );
});

// Fetch event: serve assets from cache
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Check if it's a navigation request for your domain without file extension
  if (event.request.mode === 'navigate' && url.origin === location.origin && !url.pathname.includes('.')) {
    console.log('Cached page response:', event.request.url);

    return event.respondWith(
      caches.match('/').then(response => {
        if (!response) {
          throw new Error('Could not retrieve cached paged!');
        }

        return response;
      })
    );
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        console.log('Cached response:', event.request.url);
        return response
      } else {
        console.log('Fetching...:', event.request.url);
        return fetch(event.request);
      };
    })
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Immediately stop the previously active Service Worker and activate the new one
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
