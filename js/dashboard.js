// ==========================================================================
// صيدلية د.مصطفى فتحي حامد (Dr.Mostafa Fathy Hamed Pharmacy) - Main Dashboard Controller
// ==========================================================================

document.addEventListener("DOMContentLoaded", async () => {
    utils.setupMobileSidebar();
    
    const isAuthed = await auth.init();
    if (!isAuthed) return;

    notifications.init();
    await loadDashboardStats();
    await loadRecentOrders();

    // Hook realtime event
    window.onNewRealtimeOrder = () => {
        loadDashboardStats();
        loadRecentOrders();
    };

    window.onLanguageChange = () => {
        loadDashboardStats();
        loadRecentOrders();
    };
});

async function loadDashboardStats() {
    try {
        const client = db.getClient();
        let query = client.from("orders").select("id, status, total, branch_id");

        // Pharmacist branch filter
        if (auth.isPharmacist() && auth.getUserBranchId()) {
            query = query.or(`branch_id.eq.${auth.getUserBranchId()},branch_id.is.null`);
        }

        const { data, error } = await query;
        if (error) throw error;

        const counts = {
            new: 0,
            confirmed: 0,
            ready: 0,
            completed: 0,
            cancelled: 0
        };

        (data || []).forEach(order => {
            const st = (order.status || "new").toLowerCase();
            if (counts[st] !== undefined) {
                counts[st]++;
            }
        });

        const newEl = document.getElementById("statCountNew");
        const confirmedEl = document.getElementById("statCountConfirmed");
        const readyEl = document.getElementById("statCountReady");
        const completedEl = document.getElementById("statCountCompleted");
        const cancelledEl = document.getElementById("statCountCancelled");

        if (newEl) newEl.textContent = counts.new;
        if (confirmedEl) confirmedEl.textContent = counts.confirmed;
        if (readyEl) readyEl.textContent = counts.ready;
        if (completedEl) completedEl.textContent = counts.completed;
        if (cancelledEl) cancelledEl.textContent = counts.cancelled;

    } catch (err) {
        console.error("Dashboard stats error:", err);
    }
}

async function loadRecentOrders() {
    const tableBody = document.getElementById("recentOrdersTableBody");
    const emptyState = document.getElementById("emptyRecentOrdersState");
    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;">${i18n.t("loadingData")}</td></tr>`;

    try {
        const client = db.getClient();
        let query = client
            .from("orders")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(8);

        if (auth.isPharmacist() && auth.getUserBranchId()) {
            query = query.or(`branch_id.eq.${auth.getUserBranchId()},branch_id.is.null`);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (!data || data.length === 0) {
            tableBody.innerHTML = "";
            if (emptyState) emptyState.style.display = "block";
            return;
        }

        if (emptyState) emptyState.style.display = "none";

        tableBody.innerHTML = data.map(order => {
            const tracking = utils.escHtml(order.tracking_code || `#${order.id}`);
            const customer = utils.escHtml(order.customer_name || "-");
            const phone = utils.escHtml(order.phone || "-");
            const typeBadge = utils.getOrderTypeBadge(order.order_type || order.delivery_method);
            const statusBadge = utils.getStatusBadge(order.status);
            const dateStr = utils.formatDate(order.created_at, true);
            const total = utils.formatCurrency(order.total || 0);

            // Extract cancellation reason if cancelled
            let cancelReason = "";
            if (order.cancellation_reason) {
                cancelReason = order.cancellation_reason;
            } else if (order.notes) {
                const match = order.notes.match(/\[سبب الإلغاء\]:\s*([^\n\r]+)/);
                if (match && match[1]) cancelReason = match[1];
            }
            cancelReason = utils.escHtml(cancelReason);

            const isCancelled = (order.status || "").toLowerCase() === "cancelled";
            const cancelNoteBadge = (isCancelled && cancelReason)
                ? `<div style="margin-top: 0.35rem; font-size: 0.75rem; color: #DC2626; max-width: 150px; white-space: normal; line-height: 1.3;" title="${cancelReason}">
                    <i class="fa-solid fa-circle-info"></i> ${cancelReason}
                   </div>`
                : "";

            return `
                <tr>
                    <td><strong>${tracking}</strong></td>
                    <td>
                        <div style="font-weight: 600;">${customer}</div>
                        <small style="color: var(--text-muted);">${phone}</small>
                    </td>
                    <td>${typeBadge}</td>
                    <td><strong style="color: var(--primary);">${total}</strong></td>
                    <td>
                        ${statusBadge}
                        ${cancelNoteBadge}
                    </td>
                    <td><small style="color: var(--text-muted);">${dateStr}</small></td>
                    <td>
                        <a href="order-details.html?id=${order.id}" class="btn btn-outline btn-sm">
                            <i class="fa-solid fa-eye"></i> ${i18n.t("actionViewDetails")}
                        </a>
                    </td>
                </tr>
            `;
        }).join("");

    } catch (err) {
        console.error("Recent orders error:", err);
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #EF4444; padding: 2rem;">${i18n.t("errorGeneric")}</td></tr>`;
    }
}
