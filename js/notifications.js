// ==========================================================================
// صيدلية د.مصطفى فتحي حامد (Dr.Mostafa Fathy Hamed Pharmacy) - Realtime Notifications
// ==========================================================================

const PENDING_ALERTS_KEY = "pharmacy_pending_alerts";
const PENDING_CONSULT_KEY = "pharmacy_pending_consults";
const ALERT_INTERVAL_MS  = 5000; // ring every 5 seconds while orders are pending
const CONSULT_INTERVAL_MS = 6000; // ring every 6 seconds while consultations are pending

class NotificationManager {
    constructor() {
        this.unreadCount   = 0;
        this.consultUnreadCount = 0;
        this.notifications = [];
        this.channel       = null;

        // Set of order IDs (strings) that still need pharmacist action
        this.pendingAlerts = new Set();

        // Set of consultation IDs (strings) that still need pharmacist action
        this.pendingConsultAlerts = new Set();

        // References to the repeating intervals
        this._alertInterval = null;
        this._consultInterval = null;
    }

    // ------------------------------------------------------------------
    // Initialisation
    // ------------------------------------------------------------------
    init() {
        this._loadPendingFromStorage();
        this.setupRealtimeSubscription();
        this.setupAudioPermissionCheck();

        // If there were already pending alerts (e.g. page was refreshed),
        // restart the loops immediately so the pharmacist keeps hearing them.
        if (this.pendingAlerts.size > 0) {
            this.startAlertLoop();
        }
        if (this.pendingConsultAlerts.size > 0) {
            this.startConsultAlertLoop();
        }
    }

    // ------------------------------------------------------------------
    // Realtime channel
    // ------------------------------------------------------------------
    setupRealtimeSubscription() {
        try {
            const client = db.getClient();
            if (!client) return;

            this.channel = client
                .channel("pharmacy-dashboard-live")
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "orders" },
                    (payload) => this.handleOrderEvent(payload)
                )
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "consultations" },
                    (payload) => this.handleConsultationEvent(payload)
                )
                .subscribe();

            console.log("Supabase Realtime notification channel subscribed.");
        } catch (err) {
            console.error("Realtime subscription error:", err);
        }
    }

    handleOrderEvent(payload) {
        console.log("Realtime order payload:", payload);

        if (payload.eventType === "INSERT") {
            const order = payload.new;
            this.unreadCount++;
            this.updateBadgeUI();

            // Register this order as pending → start persistent ringing
            this.addPendingAlert(String(order.id));

            // Toast notification
            const customerName = utils.escHtml(order.customer_name || i18n.t("customer"));
            const tracking     = utils.escHtml(order.tracking_code || `#${order.id}`);
            utils.showToast(
                `🔔 ${i18n.t("newOrderAlert")} (${tracking} - ${customerName})`,
                "info"
            );

            // Trigger active page refresh if applicable
            if (typeof window.onNewRealtimeOrder === "function") {
                window.onNewRealtimeOrder(order);
            }

        } else if (payload.eventType === "UPDATE") {
            const order = payload.new;

            // If an order that was pending just moved away from "new",
            // it means another tab / device confirmed or cancelled it.
            if (order.status && order.status !== "new") {
                this.removePendingAlert(String(order.id));
            }

            if (typeof window.onRealtimeOrderUpdate === "function") {
                window.onRealtimeOrderUpdate(order);
            }
        }
    }

    handleConsultationEvent(payload) {
        console.log("Realtime consultation payload:", payload);

        if (payload.eventType === "INSERT") {
            const consult = payload.new;
            this.consultUnreadCount++;
            this.updateBadgeUI();

            // Register this consultation as pending → start persistent ringing
            this.addConsultPendingAlert(String(consult.id));

            // Same toast style as orders, but with the consultation wording
            const patientName = utils.escHtml(consult.patient_name || i18n.t("consultPatient"));
            utils.showToast(
                `🩺 ${i18n.t("newConsultationAlert")} (${patientName})`,
                "info"
            );

            // Trigger active page refresh if applicable
            if (typeof window.onNewRealtimeConsultation === "function") {
                window.onNewRealtimeConsultation(consult);
            }

        } else if (payload.eventType === "UPDATE") {
            const consult = payload.new;

            // If a consultation that was pending just moved away from "new",
            // it means another tab / device confirmed, contacted, or completed it.
            if (consult.status && consult.status !== "new") {
                this.removeConsultPendingAlert(String(consult.id));
            }

            if (typeof window.onRealtimeConsultationUpdate === "function") {
                window.onRealtimeConsultationUpdate(consult);
            }
        }
    }

    // ------------------------------------------------------------------
    // Persistent alert loop (orders)
    // ------------------------------------------------------------------

    /**
     * Adds an order ID to the pending set, persists to localStorage,
     * and kicks off the repeating alert loop (if not already running).
     */
    addPendingAlert(orderId) {
        this.pendingAlerts.add(String(orderId));
        this._savePendingToStorage();
        this.startAlertLoop();
    }

    /**
     * Removes an order ID from the pending set (pharmacist took action
     * or tapped the per-row mute button). Stops the loop if no more
     * orders are waiting.
     */
    removePendingAlert(orderId) {
        this.pendingAlerts.delete(String(orderId));
        this._savePendingToStorage();
        if (this.pendingAlerts.size === 0) {
            this.stopAlertLoop();
        }
        // Re-render the orders table row mute button if we are on that page
        if (typeof window._refreshOrderMuteButtons === "function") {
            window._refreshOrderMuteButtons();
        }
    }

    /** Returns true if the given order ID is still awaiting action. */
    isPending(orderId) {
        return this.pendingAlerts.has(String(orderId));
    }

    /**
     * Starts the repeating sound interval.
     * Plays one chime immediately, then every ALERT_INTERVAL_MS ms.
     */
    startAlertLoop() {
        // Play once right away so the pharmacist hears it immediately
        utils.playNotificationSound();

        if (this._alertInterval) return; // already running

        this._alertInterval = setInterval(() => {
            if (this.pendingAlerts.size === 0) {
                this.stopAlertLoop();
                return;
            }
            utils.playNotificationSound();
        }, ALERT_INTERVAL_MS);
    }

    /** Clears the repeating interval. */
    stopAlertLoop() {
        if (this._alertInterval) {
            clearInterval(this._alertInterval);
            this._alertInterval = null;
        }
    }

    // ------------------------------------------------------------------
    // Persistent alert loop (consultations, DIFFERENT sound)
    // ------------------------------------------------------------------

    /**
     * Adds a consultation ID to the pending set, persists to localStorage,
     * and kicks off the repeating consultation alert loop with its own
     * distinct sound (playConsultationSound).
     */
    addConsultPendingAlert(consultationId) {
        this.pendingConsultAlerts.add(String(consultationId));
        this._saveConsultPendingToStorage();
        this.startConsultAlertLoop();
    }

    /**
     * Removes a consultation ID from the pending set. Stops the
     * consultation loop if no more consultations are waiting.
     */
    removeConsultPendingAlert(consultationId) {
        this.pendingConsultAlerts.delete(String(consultationId));
        this._saveConsultPendingToStorage();
        if (this.pendingConsultAlerts.size === 0) {
            this.stopConsultAlertLoop();
        }
        // Re-render the consultations table row mute button if we are on that page
        if (typeof window._refreshConsultMuteButtons === "function") {
            window._refreshConsultMuteButtons();
        }
    }

    /** Returns true if the given consultation ID is still awaiting action. */
    isConsultPending(consultationId) {
        return this.pendingConsultAlerts.has(String(consultationId));
    }

    /**
     * Starts the repeating consultation sound interval.
     * Uses a DIFFERENT sound from orders (playConsultationSound).
     */
    startConsultAlertLoop() {
        utils.playConsultationSound();

        if (this._consultInterval) return; // already running

        this._consultInterval = setInterval(() => {
            if (this.pendingConsultAlerts.size === 0) {
                this.stopConsultAlertLoop();
                return;
            }
            utils.playConsultationSound();
        }, CONSULT_INTERVAL_MS);
    }

    /** Clears the repeating consultation interval. */
    stopConsultAlertLoop() {
        if (this._consultInterval) {
            clearInterval(this._consultInterval);
            this._consultInterval = null;
        }
    }

    // ------------------------------------------------------------------
    // localStorage persistence
    // ------------------------------------------------------------------
    _loadPendingFromStorage() {
        try {
            const raw = localStorage.getItem(PENDING_ALERTS_KEY);
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) {
                    arr.forEach(id => this.pendingAlerts.add(String(id)));
                }
            }
        } catch (e) {
            console.warn("Could not load pending alerts from storage:", e);
        }

        try {
            const rawConsult = localStorage.getItem(PENDING_CONSULT_KEY);
            if (rawConsult) {
                const arr = JSON.parse(rawConsult);
                if (Array.isArray(arr)) {
                    arr.forEach(id => this.pendingConsultAlerts.add(String(id)));
                }
            }
        } catch (e) {
            console.warn("Could not load pending consultation alerts from storage:", e);
        }
    }

    _savePendingToStorage() {
        try {
            localStorage.setItem(
                PENDING_ALERTS_KEY,
                JSON.stringify([...this.pendingAlerts])
            );
        } catch (e) {
            console.warn("Could not save pending alerts to storage:", e);
        }
    }

    _saveConsultPendingToStorage() {
        try {
            localStorage.setItem(
                PENDING_CONSULT_KEY,
                JSON.stringify([...this.pendingConsultAlerts])
            );
        } catch (e) {
            console.warn("Could not save pending consultation alerts to storage:", e);
        }
    }

    // ------------------------------------------------------------------
    // Badge UI
    // ------------------------------------------------------------------
    updateBadgeUI() {
        // Topbar red dot
        const dot = document.getElementById("topbarNotificationDot");
        if (dot) {
            if (this.unreadCount + this.consultUnreadCount > 0) dot.classList.add("show");
            else dot.classList.remove("show");
        }

        // Sidebar orders badge
        const navBadge = document.getElementById("sidebarOrdersBadge");
        if (navBadge) {
            if (this.unreadCount > 0) {
                navBadge.textContent = this.unreadCount;
                navBadge.classList.add("show");
            } else {
                navBadge.classList.remove("show");
            }
        }

        // Sidebar consultations badge
        const navConsultBadge = document.getElementById("sidebarConsultationsBadge");
        if (navConsultBadge) {
            if (this.consultUnreadCount > 0) {
                navConsultBadge.textContent = this.consultUnreadCount;
                navConsultBadge.classList.add("show");
            } else {
                navConsultBadge.classList.remove("show");
            }
        }
    }

    clearUnread() {
        this.unreadCount = 0;
        this.consultUnreadCount = 0;
        this.updateBadgeUI();
    }

    // ------------------------------------------------------------------
    // Audio permission banner
    // ------------------------------------------------------------------
    setupAudioPermissionCheck() {
        const audioBanner = document.getElementById("audioPermissionBanner");
        if (!audioBanner) return;

        if (localStorage.getItem("pharmacy_sound_enabled") === "true") {
            audioBanner.style.display = "none";
        }
    }

    enableAudio() {
        localStorage.setItem("pharmacy_sound_enabled", "true");
        utils.playNotificationSound();
        utils.showToast(i18n.t("soundEnabled"), "success");

        const audioBanner = document.getElementById("audioPermissionBanner");
        if (audioBanner) audioBanner.style.display = "none";
    }
}

// Global Singleton
const notifications = new NotificationManager();
