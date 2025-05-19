// GitHub Pages Service Worker for cache control - Simplified Version
// This service worker helps control caching for GitHub Pages

const CACHE_NAME = 'github-pages-cache-v2'; // Incremented version to force cache refresh
const CACHE_MAX_AGE = 60; // Cache lifetime in seconds

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

// Helper function to add cache-busting parameter to URLs
function addCacheBustingParam(url) {
  try {
    const urlObj = new URL(url);

    // If URL already has a timestamp parameter, don't add another one
    if (urlObj.searchParams.has('t')) {
      return url;
    }

    // Add timestamp parameter
    urlObj.searchParams.set('t', Date.now());
    return urlObj.toString();
  } catch (error) {
    console.log('Error in addCacheBustingParam:', error);
    return url; // Return the original URL if there's an error
  }
}

// Fetch event handler - simplified to avoid chrome-extension URL issues
self.addEventListener('fetch', (event) => {
  // Only handle HTTP/HTTPS requests
  try {
    const url = new URL(event.request.url);

    // Skip non-HTTP(S) URLs completely
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return; // Let browser handle it normally
    }

    // Skip non-GET requests
    if (event.request.method !== 'GET') {
      return;
    }

    // Handle HTML pages - network first with cache fallback
    const isHTMLRequest = url.pathname.endsWith('.html') || url.pathname.endsWith('/');

    if (isHTMLRequest) {
      event.respondWith(
        fetch(addCacheBustingParam(event.request.url))
          .then(response => {
            // Only cache successful responses
            if (response.status === 200) {
              const clonedResponse = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, clonedResponse))
                .catch(err => console.log('Cache put error:', err));
            }
            return response;
          })
          .catch(() => {
            // Network failed, try cache
            return caches.match(event.request)
              .then(cachedResponse => {
                return cachedResponse ||
                  new Response('Page is offline', {
                    status: 503,
                    headers: { 'Content-Type': 'text/plain' }
                  });
              });
          })
      );
    } else {
      // For other resources - cache first with network fallback
      event.respondWith(
        caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }

            // Not in cache, get from network
            return fetch(event.request)
              .then(response => {
                // Only cache successful responses
                if (response.status === 200) {
                  const clonedResponse = response.clone();
                  caches.open(CACHE_NAME)
                    .then(cache => cache.put(event.request, clonedResponse))
                    .catch(err => console.log('Cache put error:', err));
                }
                return response;
              });
          })
      );
    }
  } catch (error) {
    console.log('Service worker fetch error:', error);
    // Don't call respondWith in the catch block
  }
});
