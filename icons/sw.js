// Service Worker cho Tịch Phong Thiên Sơn Blog
// Version: 1.0.0

const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `tichphong-${CACHE_VERSION}`;

// Các file tĩnh quan trọng cần cache ngay khi cài đặt
const STATIC_ASSETS = [
    '/',
    '/offline.html',
];

// Các pattern URL cần cache
const CACHE_PATTERNS = {
    fonts: /fonts\.(googleapis|gstatic)\.com/,
    images: /\.(jpg|jpeg|png|gif|webp|svg)$/i,
    styles: /\.css$/i,
    scripts: /\.js$/i,
};

// ===== INSTALL EVENT =====
// Chạy khi Service Worker được cài đặt lần đầu
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[SW] Installation complete');
                return self.skipWaiting(); // Kích hoạt ngay lập tức
            })
    );
});

// ===== ACTIVATE EVENT =====
// Chạy khi Service Worker được kích hoạt (xóa cache cũ)
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[SW] Activation complete');
                return self.clients.claim(); // Kiểm soát tất cả các trang ngay lập tức
            })
    );
});

// ===== FETCH EVENT =====
// Xử lý mọi request từ trang web
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Bỏ qua request không phải HTTP/HTTPS
    if (!url.protocol.startsWith('http')) {
        return;
    }

    // Bỏ qua request đến domain khác (trừ fonts và CDN)
    if (url.origin !== location.origin && !shouldCacheCrossDomain(url)) {
        return;
    }

    event.respondWith(handleFetch(request));
});

// ===== HELPER FUNCTIONS =====

// Kiểm tra xem có nên cache request cross-domain không
function shouldCacheCrossDomain(url) {
    return CACHE_PATTERNS.fonts.test(url.href);
}

// Xử lý fetch request với chiến lược phù hợp
async function handleFetch(request) {
    const url = new URL(request.url);

    // Chiến lược cho HTML: Network First (luôn lấy bản mới nhất)
    if (request.headers.get('accept')?.includes('text/html')) {
        return networkFirst(request);
    }

    // Chiến lược cho Images: Cache First (tiết kiệm băng thông)
    if (CACHE_PATTERNS.images.test(url.pathname)) {
        return cacheFirst(request);
    }

    // Chiến lược cho CSS/JS: Stale While Revalidate (nhanh + luôn cập nhật)
    if (CACHE_PATTERNS.styles.test(url.pathname) || CACHE_PATTERNS.scripts.test(url.pathname)) {
        return staleWhileRevalidate(request);
    }

    // Chiến lược cho Fonts: Cache First (fonts ít khi thay đổi)
    if (CACHE_PATTERNS.fonts.test(url.href)) {
        return cacheFirst(request);
    }

    // Mặc định: Network First
    return networkFirst(request);
}

// Network First: Ưu tiên network, fallback về cache
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);

        // Chỉ cache response thành công
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed, trying cache:', request.url);

        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        // Nếu là HTML và không có cache, trả về offline page
        if (request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/offline.html');
        }

        throw error;
    }
}

// Cache First: Ưu tiên cache, fallback về network
async function cacheFirst(request) {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.log('[SW] Failed to fetch:', request.url);
        throw error;
    }
}

// Stale While Revalidate: Trả cache ngay, update cache ngầm
async function staleWhileRevalidate(request) {
    const cachedResponse = await caches.match(request);

    const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse.ok) {
            const cache = caches.open(CACHE_NAME);
            cache.then((c) => c.put(request, networkResponse.clone()));
        }
        return networkResponse;
    });

    return cachedResponse || fetchPromise;
}

// ===== MESSAGE EVENT =====
// Lắng nghe message từ trang web (để skip waiting, clear cache, etc.)
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => caches.delete(cacheName))
                );
            })
        );
    }
});
