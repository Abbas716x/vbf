/* ==================================================================
   MEDINEXUS PRO — Resilient PWA Service Worker & Offline Engine
   ================================================================== */

const CACHE_NAME = 'medinexus-clinic-v1.0.0';

const STATIC_ASSETS = [
    './',
    'index.html',
    'styles.css',
    'firebase-config.js',
    'app.js',
    'manifest.webmanifest'
];

// Pre-cache App Shell Architecture on Install
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] Pre-caching static medical shell assets');
            return cache.addAll(STATIC_ASSETS);
        }).catch(err => {
            console.warn('[SW] Pre-cache boundary caught:', err);
        })
    );
});

// Purge Deprecated Caches & Claim Clients on Activation
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) {
                        console.log('[SW] Purging deprecated storage instance:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Network Interception: Stale-While-Revalidate with Cloud API Exclusions
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // Bypass caching for Firestore, Firebase Auth, Google APIs, and Non-GET requests
    if (
        requestUrl.hostname.includes('firebase') ||
        requestUrl.hostname.includes('firestore') ||
        requestUrl.hostname.includes('googleapis') ||
        requestUrl.hostname.includes('gstatic') ||
        event.request.method !== 'GET'
    ) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            const networkFetchPromise = fetch(event.request)
                .then(networkResponse => {
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    return cachedResponse;
                });

            return cachedResponse || networkFetchPromise;
        })
    );
});

// Direct Execution Trigger
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
