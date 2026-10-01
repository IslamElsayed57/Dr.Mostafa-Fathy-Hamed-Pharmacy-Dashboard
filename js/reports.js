// ==========================================================================
// صيدلية د.مصطفى فتحي حامد (Dr.Mostafa Fathy Hamed Pharmacy) - Reports & Analytics Controller
// ==========================================================================

let reportPeriod = "month";
let customStart = null;
let customEnd = null;

document.addEventListener("DOMContentLoaded", async () => {
    utils.setupMobileSidebar();

    const isAuthed = await auth.init();
    if (!isAuthed) return;

    if (!auth.isAdmin()) {
        window.location.href = "orders.html";
        return;
    }

    notifications.init();
    setupReportFilters();
    await generateReports();

    window.onLanguageChange = () => generateReports();
});

function setupReportFilters() {
    const periodSelect = document.getElementById("reportPeriodSelect");
    const customWrap = document.getElementById("reportCustomDateWrap");

    if (periodSelect) {
        periodSelect.addEventListener("change", (e) => {
            reportPeriod = e.target.value;
            if (reportPeriod === "custom") {
                if (customWrap) customWrap.style.display = "flex";
            } else {
                if (customWrap) customWrap.style.display = "none";
                generateReports();
            }
        });
    }
}

function applyReportCustomDates() {
    const start = document.getElementById("reportStartDate")?.value;
    const end = document.getElementById("reportEndDate")?.value;
    customStart = start ? new Date(start).toISOString() : null;
    customEnd = end ? new Date(`${end}T23:59:59.999Z`).toISOString() : null;
    generateReports();
}

function printCurrentReport() {
    const periodSelect = document.getElementById("reportPeriodSelect");
    const selectedPeriod = periodSelect?.selectedOptions?.[0]?.textContent?.trim();
    const start = document.getElementById("reportStartDate")?.value;
    const end = document.getElementById("reportEndDate")?.value;
    let label = selectedPeriod || "";
    if (periodSelect?.value === "custom" && (start || end)) {
        label = `${start || "…"} – ${end || "…"}`;
    }

    document.title = `${i18n.t("reportsTitle")} - ${label}`;
    window.print();
}

async function generateReports() {
    try {
        const client = db.getClient();
        let query = client.from("orders").select("id, status, total, created_at, medications, order_items(product_name_snapshot, quantity, total_price)");

        const now = new Date();
        if (reportPeriod === "today") {
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            query = query.gte("created_at", startOfDay);
        } else if (reportPeriod === "yesterday") {
            const yStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            const yEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            query = query.gte("created_at", yStart.toISOString()).lt("created_at", yEnd.toISOString());
        } else if (reportPeriod === "week") {
            const weekStart = new Date(now.setDate(now.getDate() - now.getDay())).toISOString();
            query = query.gte("created_at", weekStart);
        } else if (reportPeriod === "month") {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            query = query.gte("created_at", monthStart);
        } else if (reportPeriod === "custom") {
            if (customStart) query = query.gte("created_at", customStart);
            if (customEnd) query = query.lte("created_at", customEnd);
        }

        const { data, error } = await query;
        if (error) throw error;

        const orders = data || [];

        // 1. Calculate Metrics (Cancelled orders excluded from sales as instructed)
        let totalSales = 0;
        let totalOrders = orders.length;
        let completedCount = 0;
        let completedSales = 0;
        let cancelledCount = 0;

        const statusCounts = {};
        const productQuantities = new Map();

        orders.forEach(o => {
            const st = (o.status || "new").toLowerCase();
            statusCounts[st] = (statusCounts[st] || 0) + 1;

            if (st !== "cancelled") {
                totalSales += Number(o.total || 0);
            }

            if (st === "completed") {
                completedCount++;
                completedSales += Number(o.total || 0);
            } else if (st === "cancelled") {
                cancelledCount++;
            }

            // Top selling calculation from valid orders
            if (st !== "cancelled") {
                if (o.order_items && o.order_items.length > 0) {
                    o.order_items.forEach(item => {
                        const pName = item.product_name_snapshot;
                        const qty = Number(item.quantity) || 1;
                        productQuantities.set(pName, (productQuantities.get(pName) || 0) + qty);
                    });
                } else if (o.medications) {
                    // Extract name from text
                    const lines = o.medications.split("+");
                    lines.forEach(l => {
                        const clean = l.trim();
                        if (clean) {
                            productQuantities.set(clean, (productQuantities.get(clean) || 0) + 1);
                        }
                    });
                }
            }
        });

        // Update KPI Cards
        const totalSalesEl = document.getElementById("reportTotalSales");
        const totalOrdersEl = document.getElementById("reportTotalOrders");
        const completedSalesEl = document.getElementById("reportCompletedSales");
        const cancelledOrdersEl = document.getElementById("reportCancelledOrders");

        if (totalSalesEl) totalSalesEl.textContent = utils.formatCurrency(totalSales);
        if (totalOrdersEl) totalOrdersEl.textContent = totalOrders;
        if (completedSalesEl) completedSalesEl.textContent = `${utils.formatCurrency(completedSales)} (${completedCount} ${i18n.t("statusCompleted")})`;
        if (cancelledOrdersEl) cancelledOrdersEl.textContent = cancelledCount;

        // Render Top Selling Products Table
        renderTopProducts(productQuantities);

        // Render Status Breakdown Table
        renderStatusBreakdown(statusCounts, totalOrders);

    } catch (err) {
        console.error("Generate reports error:", err);
        utils.showToast(i18n.t("errorGeneric"), "error");
    }
}

function renderTopProducts(productQuantities) {
    const tbody = document.getElementById("topProductsTableBody");
    if (!tbody) return;

    const sorted = Array.from(productQuantities.entries())
        .sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="2" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">${i18n.t("noDataFound")}</td></tr>`;
        return;
    }

    tbody.innerHTML = sorted.map(([name, qty]) => `
        <tr>
            <td><strong>${utils.escHtml(name)}</strong></td>
            <td><span class="badge badge-active">${qty} ${i18n.currentLang === "ar" ? "قطعة" : "Units"}</span></td>
        </tr>
    `).join("");
}

function renderStatusBreakdown(statusCounts, totalOrders) {
    const tbody = document.getElementById("statusBreakdownTableBody");
    if (!tbody) return;

    const statuses = ["new", "confirmed", "ready", "out_for_delivery", "completed", "cancelled"];
    
    tbody.innerHTML = statuses.map(st => {
        const count = statusCounts[st] || 0;
        const pct = totalOrders > 0 ? ((count / totalOrders) * 100).toFixed(1) : "0.0";
        return `
            <tr>
                <td>${utils.getStatusBadge(st)}</td>
                <td><strong>${count}</strong></td>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <div style="flex: 1; height: 8px; background: var(--bg-surface-subtle); border-radius: 4px; overflow: hidden;">
                            <div style="height: 100%; width: ${pct}%; background: var(--primary);"></div>
                        </div>
                        <small style="color: var(--text-muted); font-weight: 600;">${pct}%</small>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}
