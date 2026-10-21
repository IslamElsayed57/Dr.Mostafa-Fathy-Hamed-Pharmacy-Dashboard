// ==========================================================================
// صيدلية د.مصطفى فتحي حامد (Pharmacy Dashboard) - PWA:
// تسجيل Service Worker + إشعار التحديث العربي (تحديث الآن / لاحقًا)
// ==========================================================================
// ملاحظات أمنية:
//  - لا يخزّن أي بيانات ولا يلمس localStorage/sessionStorage سوى علامة
//    واحدة غير حساسة داخل sessionStorage لمنع تكرار الإشعار في نفس الجلسة.
//  - لا يعيد تحميل الصفحة إلا بعد ضغط المستخدم على «تحديث الآن»
//    (يمنع حلقة إعادة التحميل وإعادة التحميل عند أول تثبيت).
// ==========================================================================
(function () {
    'use strict';

    if (!('serviceWorker' in navigator)) return;

    var SW_URL = '/Dr.Mostafa-Fathy-Hamed-Pharmacy-Dashboard/sw.js';
    var SW_SCOPE = '/Dr.Mostafa-Fathy-Hamed-Pharmacy-Dashboard/';

    var DISMISS_KEY = 'pmfd-dash-update-dismissed-at';
    var DISMISS_TTL = 4 * 60 * 60 * 1000; // إعادة إظهار الإشعار بعد 4 ساعات كحد أقصى

    var _registration = null;
    var _waitingWorker = null;
    var _dismissedWorker = null;   // نفس كائن الـ SW الذي رفضه المستخدم (لمنع التكرار)
    var _updateRequested = false;  // يصبح true فقط بعد زر «تحديث الآن»
    var _reloadPending = false;    // حارس ضد حلقة إعادة التحميل
    var _lastUpdateCheck = 0;

    // ── تسجيل Service Worker ───────────────────────────────────────────
    window.addEventListener('load', function () {
        navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }).then(function (reg) {
            _registration = reg;
            _lastUpdateCheck = Date.now();

            // تحديث منتظر من قبل (مثلاً بعد رجوع المستخدم للصفحة)
            if (reg.waiting && navigator.serviceWorker.controller) {
                setWaitingWorker(reg.waiting);
                showUpdateBanner('load');
            }

            // اكتشاف إصدار جديد
            reg.addEventListener('updatefound', function () {
                var installing = reg.installing;
                if (!installing) return;

                installing.addEventListener('statechange', function () {
                    // 'installed' = جاهز للانتظار حتى موافقة المستخدم
                    // وجود controller سابق = تحديث حقيقي وليس أول تثبيت
                    if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                        setWaitingWorker(installing);
                        showUpdateBanner('updatefound');
                    }
                });
            });
        }).catch(function (err) {
            console.warn('[PWA] فشل تسجيل Service Worker:', err);
        });

        // إعادة تحقق دورية من وجود إصدار جديد (مرة كل ساعة)
        setInterval(function () {
            if (document.hidden || !_registration) return;
            _lastUpdateCheck = Date.now();
            try { _registration.update(); } catch (e) { /* تجاهل */ }
        }, 60 * 60 * 1000);

        // إعادة تحقق عند العودة للصفحة بعد غياب طويل
        document.addEventListener('visibilitychange', function () {
            if (document.hidden || !_registration) return;
            if (Date.now() - _lastUpdateCheck < 5 * 60 * 1000) return;
            _lastUpdateCheck = Date.now();
            try { _registration.update(); } catch (e) { /* تجاهل */ }
        });

        // ── إعادة التحميل بعد تفعيل المستخدم للتحديث (مرة واحدة فقط) ──
        navigator.serviceWorker.addEventListener('controllerchange', function () {
            if (!_updateRequested) return;      // لا إعادة تحميل إلا بطلب صريح
            if (_reloadPending) return;
            _reloadPending = true;
            try { sessionStorage.removeItem(DISMISS_KEY); } catch (e) { /* تجاهل */ }
            window.location.reload();
        });
    });

    function setWaitingWorker(worker) {
        _waitingWorker = worker;
    }

    function wasDismissedRecently() {
        try {
            var at = Number(sessionStorage.getItem(DISMISS_KEY) || 0);
            return at > 0 && (Date.now() - at) < DISMISS_TTL;
        } catch (e) {
            return false;
        }
    }

    function markDismissed() {
        try { sessionStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) { /* تجاهل */ }
    }

    function clearDismissed() {
        try { sessionStorage.removeItem(DISMISS_KEY); } catch (e) { /* تجاهل */ }
    }

    // ── فحص ما إذا كان هناك عمل غير محفوظ قد يضيع بعد إعادة التحميل ──
    // يعيد نص وصف بالعربية أو null. هذا فحص تقديري ولا يغطي كل الحالات.
    function getUnsavedWorkReason() {
        // 1) نموذج به بيانات مُعدّلة ولم يُرسل
        var forms = document.querySelectorAll('form');
        for (var i = 0; i < forms.length; i++) {
            var fields = forms[i].elements;
            for (var j = 0; j < fields.length; j++) {
                var f = fields[j];
                try {
                    if (f.type === 'file') {
                        if (f.files && f.files.length > 0) {
                            return 'يوجد ملف مُختار ولم يُرفع بعد.';
                        }
                    } else if (f.type === 'checkbox' || f.type === 'radio') {
                        if (f.checked !== f.defaultChecked) {
                            return 'يوجد نموذج به تغييرات غير محفوظة.';
                        }
                    } else if (f.tagName === 'SELECT') {
                        var changed = false;
                        for (var k = 0; k < f.options.length; k++) {
                            if (f.options[k].selected !== f.options[k].defaultSelected) { changed = true; break; }
                        }
                        if (changed) return 'يوجد نموذج به تغييرات غير محفوظة.';
                    } else if (typeof f.value === 'string' && typeof f.defaultValue === 'string') {
                        if (f.value !== f.defaultValue) {
                            return 'يوجد نموذج به تغييرات غير محفوظة.';
                        }
                    }
                } catch (e) { /* تجاهل حقل غير قابل للفحص */ }
            }
        }

        // 2) زر إرسال معطّل = عملية إرسال جارية حالياً
        if (document.querySelector('button[type="submit"][disabled], input[type="submit"][disabled]')) {
            return 'تبدو هناك عملية إرسال جارية حالياً.';
        }

        // 3) نافذة عمل مفتوحة (رفع/استيراد Excel/ربط الصور/منتج)
        if (document.querySelector('.modal-backdrop.active')) {
            return 'توجد نافذة عمل مفتوحة (استيراد أو رفع أو تعديل).';
        }

        return null;
    }

    // ── بناء عنصر الإشعار (يُنشأ عند الحاجة فقط) ──────────────────────
    function ensureBanner() {
        var existing = document.getElementById('pwaUpdateBanner');
        if (existing) return existing;

        var banner = document.createElement('div');
        banner.id = 'pwaUpdateBanner';
        banner.setAttribute('role', 'alertdialog');
        banner.setAttribute('aria-modal', 'false');
        banner.setAttribute('aria-live', 'assertive');
        banner.setAttribute('aria-labelledby', 'pwaUpdateTitle');
        banner.setAttribute('aria-label', 'تحديث متاح للوحة التحكم');
        banner.style.cssText = [
            'display:none',
            'position:fixed',
            'bottom:1.5rem',
            'left:50%',
            'transform:translateX(-50%)',
            'z-index:99999',
            'background:linear-gradient(135deg,#5A3825 0%,#7D5A38 100%)',
            'color:#FAF7F4',
            'border-radius:1rem',
            'box-shadow:0 8px 32px rgba(90,56,37,.45),0 2px 8px rgba(0,0,0,.18)',
            'padding:1.2rem 1.6rem 1.1rem',
            'max-width:min(92vw,420px)',
            'width:100%',
            'direction:rtl',
            'text-align:center',
            'font-family:Arial,Helvetica,sans-serif',
            'animation:pwaSlideUp .4s cubic-bezier(.22,1,.36,1)'
        ].join(';');

        var title = document.createElement('p');
        title.id = 'pwaUpdateTitle';
        title.style.cssText = 'margin:0 0 .35rem;font-size:1.05rem;font-weight:700;line-height:1.4;';
        title.textContent = '🔄 تحديث جديد متاح!';

        var msg = document.createElement('p');
        msg.style.cssText = 'margin:0 0 1rem;font-size:.87rem;opacity:.88;line-height:1.65;';
        msg.textContent = 'يتوفر إصدار جديد من الموقع. يمكنك التحديث الآن أو المتابعة بالإصدار الحالي.';

        var actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:.7rem;justify-content:center;flex-wrap:wrap;';

        var btnNow = document.createElement('button');
        btnNow.id = 'pwaUpdateNow';
        btnNow.type = 'button';
        btnNow.textContent = 'تحديث الآن';
        btnNow.style.cssText = 'background:#FAF7F4;color:#5A3825;border:none;border-radius:.6rem;' +
            'padding:.6rem 1.5rem;font-size:.97rem;font-weight:700;cursor:pointer;font-family:inherit;';

        var btnLater = document.createElement('button');
        btnLater.id = 'pwaUpdateLater';
        btnLater.type = 'button';
        btnLater.textContent = 'لاحقًا';
        btnLater.style.cssText = 'background:transparent;color:#FAF7F4;border:2px solid rgba(250,247,244,.55);' +
            'border-radius:.6rem;padding:.6rem 1.5rem;font-size:.97rem;font-weight:600;cursor:pointer;font-family:inherit;';

        actions.appendChild(btnNow);
        actions.appendChild(btnLater);
        banner.appendChild(title);
        banner.appendChild(msg);
        banner.appendChild(actions);

        // Keyframes للحركة
        if (!document.getElementById('pwaUpdateStyle')) {
            var style = document.createElement('style');
            style.id = 'pwaUpdateStyle';
            style.textContent = '@keyframes pwaSlideUp{from{opacity:0;transform:translateX(-50%) translateY(24px)}' +
                'to{opacity:1;transform:translateX(-50%) translateY(0)}}';
            document.head.appendChild(style);
        }

        document.body.appendChild(banner);

        // ── زر «تحديث الآن» ────────────────────────────────────────────
        btnNow.addEventListener('click', function () {
            var reason = getUnsavedWorkReason();
            if (reason) {
                var proceed = window.confirm(
                    reason + '\n\nسيتم تحديث الموقع وإعادة تحميل الصفحة الآن،' +
                    '\nقد تفقد هذه البيانات غير المحفوظة.\n\nهل تريد المتابعة؟'
                );
                if (!proceed) return;
            }

            if (!_waitingWorker) {
                // لم يعد هناك إصدار منتظر — لا نعيد التحميل بلا سبب
                hideUpdateBanner();
                return;
            }

            _updateRequested = true;
            clearDismissed();
            hideUpdateBanner();
            // إعادة التحميل يتم من مستمع controllerchange أعلاه
            _waitingWorker.postMessage({ type: 'SKIP_WAITING' });
        });

        // ── زر «لاحقًا» ────────────────────────────────────────────────
        btnLater.addEventListener('click', function () {
            // نمنع إعادة الإظهار لنفس التحديث (نفس الجلسة أو بعد تنقّل)
            _dismissedWorker = _waitingWorker;
            markDismissed();
            hideUpdateBanner(); // بدون إعادة تحميل
        });

        // ── مفتاح Escape يغلق الإشعار (يعادل «لاحقًا») ────────────────
        banner.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                _dismissedWorker = _waitingWorker;
                markDismissed();
                hideUpdateBanner();
            }
        });

        return banner;
    }

    function showUpdateBanner(reason) {
        // نفس التحديث الذي رفضه المستخدم سابقاً في هذه الصفحة → لا نعيد الإظهار
        if (_waitingWorker && _waitingWorker === _dismissedWorker) return;

        // بعد تنقّل الصفحة: علامة الرفض تمنع التكرار لفترة قصيرة
        // (إذا وصل إصدار جديد فعلياً أثناء الصفحة نفسها فسبب reason='updatefound'
        //  يتجاهل هذه العلامة ويسمح بالإظهار)
        if (reason === 'load' && wasDismissedRecently()) return;

        var banner = ensureBanner();
        banner.style.display = 'block';
        var btnNow = document.getElementById('pwaUpdateNow');
        if (btnNow && typeof btnNow.focus === 'function') {
            try { btnNow.focus({ preventScroll: true }); } catch (e) { btnNow.focus(); }
        }
    }

    function hideUpdateBanner() {
        var banner = document.getElementById('pwaUpdateBanner');
        if (banner) banner.style.display = 'none';
    }

})();
