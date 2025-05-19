// GitHub Pages Service Worker for cache control
// This service worker helps control caching for GitHub Pages

const CACHE_NAME = 'github-pages-cache-v1';
const CACHE_MAX_AGE = 60; // Cache lifetime in seconds

// Get the base path for the service worker
const BASE_PATH = self.location.pathname.substring(0, self.location.pathname.lastIndexOf('/'));

// Install event - create cache
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Activate immediately
  console.log('GitHub Pages Service Worker installed');
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  console.log('GitHub Pages Service Worker activated');
  return self.clients.claim(); // Take control immediately
});

// Helper function to determine if a request should be cached
function shouldCache(request) {
  const url = new URL(request.url);

  // Don't cache API requests
  if (url.pathname.startsWith('/api/')) {
    return false;
  }

  // Only cache GET requests
  if (request.method !== 'GET') {
    return false;
  }

  // Don't cache URLs with cache-busting parameters
  if (url.search.includes('t=')) {
    return false;
  }

  return true;
}

// Helper function to add cache-busting parameter to URLs
function addCacheBustingParam(url) {
  const urlObj = new URL(url);

  // If URL already has a timestamp parameter, don't add another one
  if (urlObj.searchParams.has('t')) {
    return url;
  }

  // Add timestamp parameter
  urlObj.searchParams.set('t', Date.now());
  return urlObj.toString();
}

// Fetch event - network first, then cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Handle HTML requests specially to ensure freshness
  const url = new URL(event.request.url);
  const isHTMLRequest = url.pathname.endsWith('.html') || url.pathname.endsWith('/');

  if (isHTMLRequest) {
    // For HTML, always go to network first
    event.respondWith(
      fetch(addCacheBustingParam(event.request.url))
        .then(response => {
          // Clone the response to store in cache
          const responseToCache = response.clone();

          // Store in cache with timestamp
          caches.open(CACHE_NAME).then(cache => {
            const cacheMetadata = {
              timestamp: Date.now(),
              response: responseToCache
            };
            cache.put(event.request, responseToCache);
          });

          return response;
        })
        .catch(() => {
          // If network fails, try the cache
          return caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
              console.log('Serving from cache:', event.request.url);
              return cachedResponse;
            }
            // If not in cache, return a basic offline page
            return new Response('Page is offline', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
          });
        })
    );
  } else {
    // For non-HTML resources, use cache first for performance, but update cache in background
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        // Check if we have a valid cached response
        if (cachedResponse) {
          // Fetch from network in the background to update cache
          fetch(event.request).then(networkResponse => {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkResponse);
            });
          }).catch(() => {
            console.log('Background fetch failed for:', event.request.url);
          });

          return cachedResponse;
        }

        // If not in cache, fetch from network
        return fetch(event.request).then(networkResponse => {
          // Cache the response if it should be cached
          if (shouldCache(event.request)) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }

          return networkResponse;
        });
      })
    );
  }
});
