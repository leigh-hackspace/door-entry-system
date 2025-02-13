const CACHE_NAME = 'door-entry-management-system-[VERSION]';
const ASSETS = [
  '/',
  '/login',
  '/js/app.js?v=[VERSION]',
  '/css/app.css?v=[VERSION]',
  '/css/bootstrap.css?v=[VERSION]',
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
  let request = event.request;

  // const url = new URL(request.url);
  // const version = url.searchParams.get('v');

  // const [path] = request.url.split('?');

  // // All pages are the same. No "." means it's not an asset
  // if (!path.includes('.')) {
  //   const url = path.split('/').slice(0, -1).join('/') + '/' + (version ? '?v=' + version : '')

  //   request = new Request(url, {
  //     method: request.method,
  //     headers: request.headers,
  //     integrity: request.integrity,
  //   });
  // }

  event.respondWith(
    caches.match(request).then(response => {
      if (response) {
        console.log('Cached response:', request.url);
        return response
      } else {
        console.log('Fetching...:', request.url);
        return fetch(request);
      }
      // return response || fetch(request);
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
