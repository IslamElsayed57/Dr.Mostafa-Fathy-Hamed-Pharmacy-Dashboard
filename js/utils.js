// ==========================================================================
// صيدلية د.مصطفى فتحي حامد (Dr.Mostafa Fathy Hamed Pharmacy) - Utility Helpers
// ==========================================================================

const utils = {
    /**
     * Formats price number to currency string
     */
    formatCurrency(amount) {
        const val = Number(amount) || 0;
        const formatted = val.toFixed(2);
        return i18n.currentLang === "ar" ? `${formatted} ج.م` : `${formatted} EGP`;
    },

    escHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    },

    /**
     * Formats ISO timestamp to human date
     */
    formatDate(dateStr, includeTime = false) {
        if (!dateStr) return "-";
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;

        const options = {
            year: "numeric",
            month: "short",
            day: "numeric"
        };

        if (includeTime) {
            options.hour = "2-digit";
            options.minute = "2-digit";
        }

        return d.toLocaleDateString(i18n.currentLang === "ar" ? "ar-EG" : "en-US", options);
    },

    /**
     * Translates a known consultation type string (from the customer form)
     * to the current language. Returns the original value if unknown.
     */
    translateConsultType(n) {
        const TYPE_KEYS = {
            "استشارة دوائية وتعارضات الأدوية": "consultTypeMed",
            "روتين العناية بالبشرة والشعر": "consultTypeSkin",
            "متابعة أدوية السكر والضغط والقلب": "consultTypeChronic",
            "تغذية علاجية ومكملات غذائية": "consultTypeNutrition",
            "استشارة صحة الأم والطفل": "consultTypeMother",
            "أخرى": "consultTypeOther"
        };
        const key = TYPE_KEYS[String(n || "").trim()];
        return key ? i18n.t(key) : (n || "-");
    },

    /**
     * Generates a status badge HTML
     */
    getStatusBadge(status) {
        const s = (status || "new").toLowerCase();
        let icon = "fa-clock";
        let labelKey = "statusNew";

        switch (s) {
            case "new":
                icon = "fa-sparkles";
                labelKey = "statusNew";
                break;
            case "confirmed":
                icon = "fa-circle-check";
                labelKey = "statusConfirmed";
                break;
            case "ready":
                icon = "fa-box-check";
                labelKey = "statusReady";
                break;
            case "out_for_delivery":
            case "out for delivery":
                icon = "fa-truck-fast";
                labelKey = "statusOutForDelivery";
                break;
            case "completed":
                icon = "fa-badge-check";
                labelKey = "statusCompleted";
                break;
            case "cancelled":
                icon = "fa-ban";
                labelKey = "statusCancelled";
                break;
        }

        const normClass = s.replace(/\s+/g, "_");
        return `<span class="badge badge-${normClass}"><i class="fa-solid ${icon}"></i> ${i18n.t(labelKey)}</span>`;
    },

    /**
     * Generates order type badge HTML
     */
    getOrderTypeBadge(type) {
        const t = (type || "").toLowerCase();
        const isDelivery = t.includes("delivery") || t.includes("توصيل");
        if (isDelivery) {
            return `<span class="badge badge-delivery"><i class="fa-solid fa-motorcycle"></i> ${i18n.t("typeDelivery")}</span>`;
        }
        return `<span class="badge badge-pickup"><i class="fa-solid fa-store"></i> ${i18n.t("typePickup")}</span>`;
    },

    /**
     * Displays a toast notification
     */
    showToast(message, type = "success") {
        let container = document.getElementById("toastContainer");
        if (!container) {
            container = document.createElement("div");
            container.id = "toastContainer";
            container.className = "toast-container";
            document.body.appendChild(container);
        }

        const toast = document.createElement("div");
        toast.className = `toast-msg ${type}`;
        
        let icon = "fa-circle-check";
        if (type === "error") icon = "fa-circle-exclamation";
        if (type === "info") icon = "fa-bell";

        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateY(20px)";
            toast.style.transition = "all 0.3s ease";
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    },

    /**
     * Plays a synthesized healthcare chime using Web Audio API
     */
    playNotificationSound() {
        if (localStorage.getItem("pharmacy_sound_enabled") === "false") return;

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;

            const ctx = new AudioContext();
            if (ctx.state === "suspended") {
                ctx.resume();
            }

            const now = ctx.currentTime;
            
            // First note (E5)
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = "sine";
            osc1.frequency.setValueAtTime(659.25, now);
            gain1.gain.setValueAtTime(0.2, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.3);

            // Second note (A5)
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = "sine";
            osc2.frequency.setValueAtTime(880.00, now + 0.15);
            gain2.gain.setValueAtTime(0.25, now + 0.15);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.15);
            osc2.stop(now + 0.5);
        } catch (e) {
            console.warn("Could not play synthesized audio:", e);
        }
    },

    /**
     * Plays a distinct synthesized chime for NEW CONSULTATIONS.
     * Same style/behaviour as the order chime, but with a different
     * tone so staff can tell a consultation request apart by ear.
     */
    playConsultationSound() {
        if (localStorage.getItem("pharmacy_sound_enabled") === "false") return;

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;

            const ctx = new AudioContext();
            if (ctx.state === "suspended") {
                ctx.resume();
            }

            const now = ctx.currentTime;

            // Softer, warmer two-note "ring" (C6 → G5) to differ from orders
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = "sine";
            osc1.frequency.setValueAtTime(1046.50, now);
            gain1.gain.setValueAtTime(0.16, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.35);

            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = "sine";
            osc2.frequency.setValueAtTime(783.99, now + 0.18);
            gain2.gain.setValueAtTime(0.18, now + 0.18);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.18);
            osc2.stop(now + 0.55);
        } catch (e) {
            console.warn("Could not play consultation audio:", e);
        }
    },

    /**
     * Shows a confirmation modal
     */
    showConfirm(title, message, onConfirm) {
        let modal = document.getElementById("genericConfirmModal");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "genericConfirmModal";
            modal.className = "modal-backdrop";
            modal.innerHTML = `
                <div class="modal-card">
                    <div class="modal-header">
                        <h4 class="card-title" id="confirmModalTitle"></h4>
                        <button class="btn btn-icon btn-sm" onclick="utils.closeConfirm()"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <div class="modal-body">
                        <p id="confirmModalMsg"></p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="utils.closeConfirm()">${i18n.t("cancel")}</button>
                        <button class="btn btn-danger" id="confirmModalActionBtn">${i18n.t("confirmDeleteTitle")}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        document.getElementById("confirmModalTitle").textContent = title || i18n.t("confirmDeleteTitle");
        document.getElementById("confirmModalMsg").textContent = message || i18n.t("confirmDeleteMsg");
        
        const actionBtn = document.getElementById("confirmModalActionBtn");
        actionBtn.onclick = () => {
            utils.closeConfirm();
            if (typeof onConfirm === "function") onConfirm();
        };

        modal.classList.add("active");
    },

    closeConfirm() {
        const modal = document.getElementById("genericConfirmModal");
        if (modal) modal.classList.remove("active");
    },

    /**
     * Initializes sidebar hamburger toggle for mobile
     */
    setupMobileSidebar() {
        const btnHamburger = document.getElementById("btnHamburger");
        const sidebar = document.getElementById("appSidebar");
        let overlay = document.getElementById("sidebarOverlay");

        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "sidebarOverlay";
            overlay.className = "sidebar-overlay";
            document.body.appendChild(overlay);
        }

        // Always force the mobile menu into a closed state on load. This
        // guards against the browser restoring a previous page's "open"
        // state from its back/forward cache (bfcache), which otherwise
        // makes the sidebar appear open by itself right when a new page
        // finishes loading, even though nothing was tapped.
        const closeMobileMenu = () => {
            sidebar?.classList.remove("mobile-open");
            overlay.classList.remove("active");
        };
        closeMobileMenu();

        window.addEventListener("pageshow", (e) => {
            if (e.persisted) closeMobileMenu();
        });

        if (btnHamburger && sidebar) {
            btnHamburger.onclick = () => {
                sidebar.classList.toggle("mobile-open");
                overlay.classList.toggle("active");
            };

            // Close sidebar when tapping the dim overlay
            overlay.onclick = () => {
                closeMobileMenu();
            };

            // Close sidebar when tapping any nav link inside it (mobile UX)
            sidebar.querySelectorAll("a.nav-item").forEach((link) => {
                link.addEventListener("click", () => {
                    closeMobileMenu();
                });
            });

            // Close sidebar when tapping anywhere outside it on the document
            document.addEventListener("click", (e) => {
                if (
                    sidebar.classList.contains("mobile-open") &&
                    !sidebar.contains(e.target) &&
                    e.target !== btnHamburger &&
                    !btnHamburger.contains(e.target)
                ) {
                    closeMobileMenu();
                }
            });
        }
    }
};
