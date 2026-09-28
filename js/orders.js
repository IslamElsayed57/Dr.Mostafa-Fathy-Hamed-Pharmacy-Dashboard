// ==========================================================================
// صيدلية د.مصطفى فتحي حامد (Dr.Mostafa Fathy Hamed Pharmacy) - Orders Management Controller
// ==========================================================================

let ordersState = {
    searchQuery: "",
    statusFilter: "all",
    typeFilter: "all",
    periodFilter: "all",
    customStart: null,
    customEnd: null,
    page: 1,
    pageSize: 15,
    totalCount: 0
};

document.addEventListener("DOMContentLoaded", async () => {
    utils.setupMobileSidebar();

    const isAuthed = await auth.init();
    if (!isAuthed) return;

    notifications.init();
    setupOrdersEventListeners();
    await loadOrders();

    window.onNewRealtimeOrder = () => loadOrders();
    window.onRealtimeOrderUpdate = () => loadOrders();
    window.onLanguageChange = () => loadOrders();

    // Called by notifications.js when a pending alert is cleared from another
    // tab / page (e.g. order-details confirms an order) so the mute button
    // disappears without a full table reload.
    window._refreshOrderMuteButtons = () => {
        document.querySelectorAll(".mute-alert-btn").forEach(btn => {
            const orderId = btn.dataset.orderId;
            if (!notifications.isPending(orderId)) {
                // Hide the button — the alert is already cleared
                btn.style.display = "none";
            }
        });
    };
});

function setupOrdersEventListeners() {
    const searchInput = document.getElementById("orderSearchInput");
    const statusSelect = document.getElementById("orderStatusFilter");
    const typeSelect = document.getElementById("orderTypeFilter");
    const periodSelect = document.getElementById("orderPeriodFilter");
    const customDateWrap = document.getElementById("customDateRangeWrap");

    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener("input", (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                ordersState.searchQuery = e.target.value.trim();
                ordersState.page = 1;
                loadOrders();
            }, 300);
        });
    }

    if (statusSelect) {
        statusSelect.addEventListener("change", (e) => {
            ordersState.statusFilter = e.target.value;
            ordersState.page = 1;
            loadOrders();
        });
    }

    if (typeSelect) {
        typeSelect.addEventListener("change", (e) => {
            ordersState.typeFilter = e.target.value;
            ordersState.page = 1;
            loadOrders();
        });
    }

    if (periodSelect) {
        periodSelect.addEventListener("change", (e) => {
            ordersState.periodFilter = e.target.value;
            ordersState.page = 1;
            if (e.target.value === "custom") {
                if (customDateWrap) customDateWrap.style.display = "flex";
            } else {
                if (customDateWrap) customDateWrap.style.display = "none";
                loadOrders();
            }
        });
    }
}

function applyCustomDateFilter() {
    const start = document.getElementById("customStartDate")?.value;
    const end = document.getElementById("customEndDate")?.value;
    ordersState.customStart = start ? new Date(start).toISOString() : null;
    ordersState.customEnd = end ? new Date(`${end}T23:59:59.999Z`).toISOString() : null;
    ordersState.page = 1;
    loadOrders();
}

async function loadOrders() {
    const tableBody = document.getElementById("ordersTableBody");
    const emptyState = document.getElementById("emptyOrdersState");
    const paginationEl = document.getElementById("ordersPagination");
    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 3rem;">${i18n.t("loadingData")}</td></tr>`;

    try {
        const client = db.getClient();
        let query = client
            .from("orders")
            .select("*", { count: "exact" });

        // Branch limitation for pharmacists
        if (auth.isPharmacist() && auth.getUserBranchId()) {
            query = query.or(`branch_id.eq.${auth.getUserBranchId()},branch_id.is.null`);
        }

        // Search Filter (name, phone, tracking code)
        if (ordersState.searchQuery) {
            const sq = ordersState.searchQuery;
            query = query.or(`customer_name.ilike.%${sq}%,phone.ilike.%${sq}%,tracking_code.ilike.%${sq}%`);
        }

        // Status Filter
        if (ordersState.statusFilter && ordersState.statusFilter !== "all") {
            query = query.eq("status", ordersState.statusFilter);
        }

        // Type Filter
        if (ordersState.typeFilter && ordersState.typeFilter !== "all") {
            if (ordersState.typeFilter === "delivery") {
                query = query.or("order_type.ilike.%delivery%,delivery_method.ilike.%توصيل%");
            } else if (ordersState.typeFilter === "pickup") {
                query = query.or("order_type.ilike.%pickup%,delivery_method.ilike.%استلام%");
            }
        }

        // Period Filter
        const now = new Date();
        if (ordersState.periodFilter === "today") {
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            query = query.gte("created_at", startOfDay);
        } else if (ordersState.periodFilter === "yesterday") {
            const yStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            const yEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            query = query.gte("created_at", yStart.toISOString()).lt("created_at", yEnd.toISOString());
        } else if (ordersState.periodFilter === "week") {
            const weekStart = new Date(now.setDate(now.getDate() - now.getDay())).toISOString();
            query = query.gte("created_at", weekStart);
        } else if (ordersState.periodFilter === "month") {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            query = query.gte("created_at", monthStart);
        } else if (ordersState.periodFilter === "custom") {
            if (ordersState.customStart) query = query.gte("created_at", ordersState.customStart);
            if (ordersState.customEnd) query = query.lte("created_at", ordersState.customEnd);
        }

        // Ordering & Pagination
        const from = (ordersState.page - 1) * ordersState.pageSize;
        const to = from + ordersState.pageSize - 1;

        query = query.order("created_at", { ascending: false }).range(from, to);

        const { data, error, count } = await query;
        if (error) throw error;

        ordersState.totalCount = count || 0;

        if (!data || data.length === 0) {
            tableBody.innerHTML = "";
            if (emptyState) emptyState.style.display = "block";
            if (paginationEl) paginationEl.innerHTML = "";
            return;
        }

        if (emptyState) emptyState.style.display = "none";

        tableBody.innerHTML = data.map(order => {
            const tracking   = utils.escHtml(order.tracking_code || `#${order.id}`);
            const customer   = utils.escHtml(order.customer_name  || "-");
            const phone      = utils.escHtml(order.phone           || "-");
            const typeBadge  = utils.getOrderTypeBadge(order.order_type || order.delivery_method);
            const statusBadge = utils.getStatusBadge(order.status);
            const dateStr    = utils.formatDate(order.created_at, true);
            const total      = utils.formatCurrency(order.total || 0);

            // Extract cancellation reason if cancelled
            let cancelReason = "";
            if (order.cancellation_reason) {
                cancelReason = order.cancellation_reason;
            } else if (order.notes) {
                const match = order.notes.match(/\[سبب الإلغاء\]:\s*([^\n\r]+)/);
                if (match && match[1]) cancelReason = match[1];
            }
            cancelReason = utils.escHtml(cancelReason);
            const cancelReasonSafe = cancelReason; // بقت متأمّنة بالفعل

            const isCancelled = (order.status || "").toLowerCase() === "cancelled";
            const cancelNoteBadge = (isCancelled && cancelReason)
                ? `<span title="${cancelReasonSafe}" style="display:inline-flex; align-items:center; gap:0.3rem; max-width:150px; font-size:0.75rem; color:#DC2626; white-space:nowrap;">
                    <i class="fa-solid fa-circle-info" style="flex-shrink:0;"></i>
                    <span style="overflow:hidden; text-overflow:ellipsis;">${cancelReason}</span>
                   </span>`
                : "";

            // Show mute button only for "new" orders that still have a pending alert
            const isNew     = (order.status || "").toLowerCase() === "new";
            const isPending = notifications.isPending(order.id);
            const muteBtn   = (isNew && isPending)
                ? `<button
                        class="btn btn-warning btn-sm mute-alert-btn"
                        data-order-id="${order.id}"
                        onclick="muteOrderAlert('${order.id}', this)"
                        title="${i18n.currentLang === 'ar' ? 'كتم تنبيه هذا الطلب' : 'Mute alert for this order'}"
                        style="display:flex;align-items:center;gap:0.3rem;">
                        <i class="fa-solid fa-bell-slash"></i>
                        <span>${i18n.currentLang === 'ar' ? 'كتم التنبيه' : 'Mute Alert'}</span>
                   </button>`
                : "";

            return `
                <tr ${isNew && isPending ? 'style="background: rgba(251,191,36,0.06);"' : ''}>
                    <td><strong>${tracking}</strong></td>
                    <td>
                        <div style="font-weight: 600;">${customer}</div>
                        <small style="color: var(--text-muted);"><i class="fa-solid fa-phone"></i> ${phone}</small>
                    </td>
                    <td>${typeBadge}</td>
                    <td><strong style="color: var(--primary);">${total}</strong></td>
                    <td>
                        <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:nowrap;">
                            ${statusBadge}
                            ${cancelNoteBadge}
                        </div>
                    </td>
                    <td><small style="color: var(--text-muted);">${dateStr}</small></td>
                    <td>
                        <div style="display:flex; gap:0.4rem; align-items:center; flex-wrap:wrap;">
                            <a href="order-details.html?id=${order.id}" class="btn btn-outline btn-sm">
                                <i class="fa-solid fa-eye"></i> ${i18n.t("actionViewDetails")}
                            </a>
                            ${muteBtn}
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

        renderPaginationControls(paginationEl);

    } catch (err) {
        console.error("Load orders error:", err);
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #EF4444; padding: 2rem;">${i18n.t("errorGeneric")}</td></tr>`;
    }
}

function renderPaginationControls(container) {
    if (!container) return;

    const totalPages = Math.ceil(ordersState.totalCount / ordersState.pageSize) || 1;
    if (totalPages <= 1) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 1rem;">
            <span style="font-size: 0.85rem; color: var(--text-muted);">
                ${i18n.currentLang === "ar" 
                    ? `عرض صفحة ${ordersState.page} من ${totalPages} (إجمالي ${ordersState.totalCount} طلب)` 
                    : `Showing page ${ordersState.page} of ${totalPages} (Total ${ordersState.totalCount} orders)`}
            </span>
            <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-secondary btn-sm" ${ordersState.page <= 1 ? "disabled" : ""} onclick="changeOrdersPage(${ordersState.page - 1})">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
                <button class="btn btn-secondary btn-sm" ${ordersState.page >= totalPages ? "disabled" : ""} onclick="changeOrdersPage(${ordersState.page + 1})">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
            </div>
        </div>
    `;
}

function changeOrdersPage(newPage) {
    ordersState.page = newPage;
    loadOrders();
}

/**
 * Mutes the persistent alert for a single order without taking any
 * action on the order itself. The pharmacist has acknowledged the order
 * and will handle it manually.
 *
 * @param {string} orderId  - The order ID whose alert should be silenced.
 * @param {HTMLElement} btn - The mute button element (hidden after click).
 */
function muteOrderAlert(orderId, btn) {
    notifications.removePendingAlert(String(orderId));

    // Hide the button immediately without waiting for a table re-render
    if (btn) {
        btn.style.opacity   = "0";
        btn.style.transform = "scale(0.8)";
        btn.style.transition = "all 0.25s ease";
        setTimeout(() => { btn.style.display = "none"; }, 260);
    }

    // Also remove the highlight from the row
    const row = btn?.closest("tr");
    if (row) row.style.background = "";

    const label = i18n.currentLang === "ar"
        ? "تم كتم تنبيه الطلب"
        : "Alert muted for this order";
    utils.showToast(label, "info");
}
