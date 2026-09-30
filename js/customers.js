// ==========================================================================
// صيدلية د.مصطفى فتحي حامد (Dr.Mostafa Fathy Hamed Pharmacy) - Customers Directory Controller
// ==========================================================================

let customersList = [];
let filteredCustomers = [];

document.addEventListener("DOMContentLoaded", async () => {
    utils.setupMobileSidebar();

    const isAuthed = await auth.init();
    if (!isAuthed) return;

    notifications.init();
    setupCustomerSearchListener();
    await loadCustomers();

    window.onLanguageChange = () => renderCustomersTable();
});

function setupCustomerSearchListener() {
    const searchInput = document.getElementById("customerSearchInput");
    if (!searchInput) return;

    let debounceTimer;
    searchInput.addEventListener("input", (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const query = e.target.value.trim().toLowerCase();
            if (!query) {
                filteredCustomers = [...customersList];
            } else {
                filteredCustomers = customersList.filter(c => 
                    c.name.toLowerCase().includes(query) || c.phone.includes(query)
                );
            }
            renderCustomersTable();
        }, 250);
    });
}

async function loadCustomers() {
    const tbody = document.getElementById("customersTableBody");
    const emptyState = document.getElementById("emptyCustomersState");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 3rem;">${i18n.t("loadingData")}</td></tr>`;

    try {
        const client = db.getClient();
        
        // Fetch orders to aggregate customer summaries
        const { data, error } = await client
            .from("orders")
            .select("id, tracking_code, customer_name, phone, created_at, total, status")
            .order("created_at", { ascending: false });

        if (error) throw error;

        // Group by phone number
        const map = new Map();
        (data || []).forEach(order => {
            const phone = (order.phone || "").trim();
            if (!phone) return;

            if (!map.has(phone)) {
                map.set(phone, {
                    phone: phone,
                    name: order.customer_name || "-",
                    ordersCount: 1,
                    lastOrderDate: order.created_at, // newest first
                    totalSpent: Number(order.total || 0),
                    orders: [order]
                });
            } else {
                const item = map.get(phone);
                item.ordersCount++;
                item.totalSpent += Number(order.total || 0);
                item.orders.push(order);
            }
        });

        customersList = Array.from(map.values());
        filteredCustomers = [...customersList];

        renderCustomersTable();

    } catch (err) {
        console.error("Load customers error:", err);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #EF4444; padding: 2rem;">${i18n.t("errorGeneric")}</td></tr>`;
    }
}

function renderCustomersTable() {
    const tbody = document.getElementById("customersTableBody");
    const emptyState = document.getElementById("emptyCustomersState");
    const countBadge = document.getElementById("customersCountBadge");
    if (!tbody) return;

    if (countBadge) countBadge.textContent = `${filteredCustomers.length} ${i18n.t("customer")}`;

    if (filteredCustomers.length === 0) {
        tbody.innerHTML = "";
        if (emptyState) emptyState.style.display = "block";
        return;
    }

    if (emptyState) emptyState.style.display = "none";

    tbody.innerHTML = filteredCustomers.map((cust, idx) => {
        // Date ONLY (no time) as required
        const lastDateOnly = utils.formatDate(cust.lastOrderDate, false);
        const totalSpent = utils.formatCurrency(cust.totalSpent);
        const custName = utils.escHtml(cust.name);
        const custPhone = utils.escHtml(cust.phone);

        return `
            <tr>
                <td><strong>${custName}</strong></td>
                <td><a href="tel:${custPhone}" style="color: var(--primary); font-weight: 600;"><i class="fa-solid fa-phone"></i> ${custPhone}</a></td>
                <td><span class="badge badge-active">${cust.ordersCount} ${i18n.t("navOrders")}</span></td>
                <td><small style="color: var(--text-muted); font-weight: 600;">${lastDateOnly}</small></td>
                <td>
                    <button class="btn btn-outline btn-sm" onclick="viewCustomerOrdersModal(${idx})">
                        <i class="fa-solid fa-clock-rotate-left"></i> ${i18n.currentLang === "ar" ? "سجل الطلبات" : "Order History"}
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

function viewCustomerOrdersModal(customerIndex) {
    const cust = filteredCustomers[customerIndex];
    if (!cust) return;

    let modal = document.getElementById("customerOrdersModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "customerOrdersModal";
        modal.className = "modal-backdrop";
        modal.innerHTML = `
            <div class="modal-card" style="max-width: 600px;">
                <div class="modal-header">
                    <h4 class="card-title" id="custModalTitle"></h4>
                    <button class="btn btn-icon btn-sm" onclick="document.getElementById('customerOrdersModal').classList.remove('active')"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body">
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>${i18n.t("orderId")}</th>
                                    <th>${i18n.t("orderTotal")}</th>
                                    <th>${i18n.t("orderStatus")}</th>
                                    <th>${i18n.t("orderDate")}</th>
                                </tr>
                            </thead>
                            <tbody id="custModalOrdersBody"></tbody>
                        </table>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="document.getElementById('customerOrdersModal').classList.remove('active')">${i18n.t("close")}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    document.getElementById("custModalTitle").textContent = `${cust.name} (${cust.phone})`;
    const body = document.getElementById("custModalOrdersBody");
    body.innerHTML = cust.orders.map(o => `
        <tr>
            <td><a href="order-details.html?id=${encodeURIComponent(o.id)}" style="color: var(--primary); font-weight: 600;">#${utils.escHtml(o.tracking_code || o.id)}</a></td>
            <td>${utils.formatCurrency(o.total || 0)}</td>
            <td>${utils.getStatusBadge(o.status)}</td>
            <td>${utils.formatDate(o.created_at, false)}</td>
        </tr>
    `).join("");

    modal.classList.add("active");
}
