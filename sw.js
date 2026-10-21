/*
 * ============================================================
 * Service Worker — لوحة تحكم الصيدلية (Pharmacy Dashboard)
 * Scope  : /Dr.Mostafa-Fathy-Hamed-Pharmacy-Dashboard/
 * Cache  : pmfd-dash-v1  (CACHE_PREFIX + CACHE_VERSION)
 * ============================================================
 *
 * ⚠️  قاعدة النشر الإلزامية:
 *     غيِّر قيمة CACHE_VERSION أدناه مع كل نشر جديد،
 *     وإلا لن يحصل المستخدمون على الملفات الجديدة.
 *
 * استراتيجيات الكاش:
 *   ✗  *.supabase.co          → Pass-Through (لا يُعترض ولا يُخزَّن أبداً)
 *   ✗  أي طلب غير GET         → لا يُعترض (لا كاش ولا إعادة إرسال)
 *   ↔  ملفات CDN الخارجية      → Network-First ثم الكاش (للعمل دون إنترنت)
 *   ↔  صفحات HTML (تنقّل)      → Network-First ثم الكاش (نسخ متجددة)
 *   ✓  ملفات الموقع الثابتة    → Cache-First (كاش يحمل رقم الإصدار)
 *
 * أمان: لا يُخزَّن أي رد من Supabase (طلبات، عملاء، مرضى، روشتات،
 *       توكنات مصادقة)، ولا يُمسّ أي تخزين للمستخدم (localStorage).
 * ============================================================
 */

'use strict';

// ── إصدار الكاش (غيِّره مع كل نشر) ─────────────────────────────────
// الناتج النهائي CACHE_NAME = 'pmfd-dash-v<N>'
const CACHE_VERSION = 'v1';

// بادئة فريدة لهذا التطبيق فقط — لا تبدأ بـ 'pharmacy-' حذراً من
// موقع العملاء الذي يحذف كل كاش يبدأ بـ 'pharmacy-' في نفس الـ Origin.
const CACHE_PREFIX = 'pmfd-dash-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

// المسار الأساسي للموقع على GitHub Pages (مشروع وليس جذر النطاق)
const BASE = '/Dr.Mostafa-Fathy-Hamed-Pharmacy-Dashboard';

// ── ملفات تُجهَّز مسبقاً عند أول تثبيت (ملفات ثابتة فقط، بلا HTML) ──
const PRECACHE_URLS = [
    BASE + '/PWA/manifest.webmanifest',
    BASE + '/css/style.css',
    BASE + '/css/responsive.css',
    BASE + '/PWA/Icons/icon-192.png',
    BASE + '/PWA/Icons/icon-512.png'
];

// ── نطاقات Pass-Through: لا اعتراض ولا كاش إطلاقاً ────────────────
// جميع خدمات Supabase: REST/Auth/Storage/Realtime/Realtime-WebSocket
const BYPASS_HOSTNAMES = new Set([
    'xuctfoiwzflevnfwfqcv.supabase.co'
]);

// ── نطاقات Network-First ثم الكاش (مكتبات ثابتة) ──────────────────
const NETWORK_FIRST_HOSTNAMES = new Set([
    'cdnjs.cloudflare.com',   // Font Awesome
    'cdn.jsdelivr.net',       // supabase-js SDK (نسخة مثبتة في الرابط)
    'cdn.sheetjs.com',        // SheetJS (تصدير/استيراد Excel)
    'fonts.googleapis.com',
    'fonts.gstatic.com'
]);


// =============================================================================
// حدث Install — تجهيز ملفات الكاش الأساسية
// لا نستدعي skipWaiting(): التفعيل يحدث فقط بعد موافقة المستخدم
// عبر زر «تحديث الآن».
// =============================================================================
self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return Promise.all(PRECACHE_URLS.map(function (url) {
                return cache.add(new Request(url, { cache: 'reload' })).catch(function () {
                    // ملف مفقود واحد لا يجب أن يفشل التثبيت كله
                });
            }));
        })
    );
    // لا نستدعي skipWaiting() هنا (التفعيل بموافقة المستخدم فقط)،
    // ولا clients.claim() (غير مسموح في حدث install).
});


// =============================================================================
// حدث Activate — حذف كاشات هذا التطبيق القديمة فقط
// (لا يمس كاشات أي موقع آخر في نفس الـ Origin، ولا localStorage/IndexedDB)
// =============================================================================
self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (allKeys) {
            return Promise.all(
                allKeys
                    .filter(function (key) {
                        return key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME;
                    })
                    .map(function (key) {
                        return caches.delete(key);
                    })
            );
        }).then(function () {
            // التحكم بالصفحات المفتوحة عند التفعيل — هنا هو المكان الصحيح
            // (لا يُسبّب أي إعادة تحميل؛ pwa.js لا يعيد التحميل إلا بعد
            //  ضغط المستخدم على «تحديث الآن»، وبدون claim يبقى أول صفحة
            //  غير محمية بسياسة الكاش، ويُفعَّل أي تحديث لاحق صامتاً
            //  دون أن يرى المستخدم إشعار التحديث).
            return self.clients.claim();
        })
    );
});


// =============================================================================
// حدث Message — أمر تفعيل الـ SW المنتظر بعد موافقة المستخدم
// =============================================================================
self.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});


// =============================================================================
// حدث Fetch — سياسة اعتراض الطلبات
// =============================================================================
self.addEventListener('fetch', function (event) {
    var request = event.request;

    // 1. لا نتعامل إطلاقاً مع الطلبات غير GET
    //    (POST/PUT/PATCH/DELETE لا تُكاش ولا تُعاد أبداً)
    if (request.method !== 'GET') return;

    var url;
    try {
        url = new URL(request.url);
    } catch (_) {
        return;
    }

    // 2. المخططات غير HTTP (data:, chrome-extension:, blob: ...)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    // 3. Supabase: Pass-Through كامل — لا اعتراض ولا كاش
    if (BYPASS_HOSTNAMES.has(url.hostname)) return;

    // 4. ملفات CDN الخارجية: Network-First ثم الكاش
    if (url.hostname !== self.location.hostname) {
        if (NETWORK_FIRST_HOSTNAMES.has(url.hostname)) {
            event.respondWith(fetchNetworkFirst(request));
        }
        // أي نطاق خارجي آخر: يمر للشبكة دون اعتراض
        return;
    }

    // 5. صفحات الموقع (تنقل HTML): Network-First ثم الكاش
    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(handleDocument(request));
        return;
    }

    // 6. ملفات الموقع الثابتة (css/js/img/fonts محلية): Cache-First
    event.respondWith(fetchCacheFirst(request));
});


// =============================================================================
// Network-First للملفات الخارجية (مع رجوع للكاش عند انقطاع الشبكة)
// =============================================================================
function fetchNetworkFirst(request) {
    return fetch(request).then(function (response) {
        if (response && response.ok && response.type === 'basic') {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
                cache.put(request, clone);
            });
        }
        return response;
    }).catch(function () {
        return caches.open(CACHE_NAME).then(function (cache) {
            return cache.match(request);
        }).then(function (cached) {
            return cached || new Response('', { status: 503, statusText: 'Service Unavailable' });
        });
    });
}


// =============================================================================
// Network-First لصفحات HTML
// - أونلاين: نسخة متجددة دائماً من الخادم (تمنع اختلاط النسخ)
// - أوفلاين: آخر نسخة محفوظة، وإلا صفحة «لا يوجد اتصال» مبنية ديناميكياً
// =============================================================================
function handleDocument(request) {
    return fetch(request).then(function (response) {
        if (response && response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
                cache.put(normalizeCacheKey(request), clone);
            });
        }
        return response;
    }).catch(function () {
        return caches.open(CACHE_NAME).then(function (cache) {
            return cache.match(normalizeCacheKey(request));
        }).then(function (cached) {
            return cached || offlinePageResponse();
        });
    });
}


// =============================================================================
// Cache-First لملفات الموقع الثابتة (مع رجوع للشبكة عند الغياب)
// =============================================================================
function fetchCacheFirst(request) {
    var cacheKey = normalizeCacheKey(request);

    return caches.open(CACHE_NAME).then(function (cache) {
        return cache.match(cacheKey).then(function (cached) {
            if (cached) return cached;

            return fetch(request).then(function (response) {
                if (response && response.ok) {
                    var clone = response.clone();
                    cache.put(cacheKey, clone);
                }
                return response;
            }).catch(function () {
                return new Response('', { status: 503, statusText: 'Service Unavailable' });
            });
        });
    });
}


// =============================================================================
// مساعد: تطبيع مفتاح الكاش بحذف query string
// (يعامل style.css?v=20261021-1 كملف واحد، وتُزال المعاملة مع كل إصدار)
// =============================================================================
function normalizeCacheKey(request) {
    var url = new URL(request.url);
    if (!url.search) return request;

    url.search = '';
    return new Request(url.toString(), {
        method: request.method,
        headers: request.headers,
        mode: request.mode === 'navigate' ? 'same-origin' : request.mode,
        credentials: request.credentials,
        redirect: request.redirect
    });
}


// =============================================================================
// صفحة بديلة عند غياب الاتصال وغياب أي نسخة محفوظة
// (لا تحتوي أي بيانات — مجرد رسالة خطأ)
// =============================================================================
function offlinePageResponse() {
    var html =
        '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
        '<title>لا يوجد اتصال بالإنترنت</title></head>' +
        '<body style="font-family:Arial,Helvetica,sans-serif;text-align:center;' +
        'padding:3rem;direction:rtl;background:#FAF7F4;color:#5A3825">' +
        '<h2>⚠️ لا يوجد اتصال بالإنترنت</h2>' +
        '<p>تعذّر تحميل لوحة التحكم. تحقق من الاتصال ثم أعد المحاولة.</p>' +
        '<button onclick="location.reload()" style="padding:.75rem 2rem;background:#5A3825;' +
        'color:#fff;border:none;border-radius:.5rem;font-size:1rem;cursor:pointer">' +
        'إعادة المحاولة</button></body></html>';

    return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
}
