// ==========================================================================
// صيدلية د.مصطفى فتحي حامد (Dr.Mostafa Fathy Hamed Pharmacy) - Products Catalog Controller
// ==========================================================================

let productsList = [];
let categoriesList = [];

// Bulk selection (admin only): ids of the rows currently ticked
let selectedProductIds = new Set();
let displayedProducts = [];

let productFilterState = {
    searchQuery: "",
    categoryId: "all",
    onlyDiscounts: false,
    page: 1,
    pageSize: 50,
    totalCount: 0
};
let searchDebounceTimer = null;

// Product Image State for Modal
let currentProductImageUrl = null;
let isImageMarkedForDeletion = false;

document.addEventListener("DOMContentLoaded", async () => {
    utils.setupMobileSidebar();

    const isAuthed = await auth.init();
    if (!isAuthed) return;

    notifications.init();
    await loadCategoriesDropdown();
    await loadProducts();
    setupProductSearch();
    setupCategoryFilter();
    setupProductImageInput();
    setupPriceInputsValidation();

    window.onLanguageChange = () => {
        loadCategoriesDropdown();
        loadProducts();
        updateProductModalImageLabels();
    };
});

function applyProductFilters() {
    productFilterState.page = 1;
    loadProducts();
}

function setupProductSearch() {
    const input = document.getElementById("productSearchInput");
    if (!input) return;

    input.addEventListener("input", (e) => {
        clearTimeout(searchDebounceTimer);
        const val = e.target.value.trim();
        searchDebounceTimer = setTimeout(() => {
            productFilterState.searchQuery = val;
            productFilterState.page = 1;
            loadProducts();
        }, 300);
    });
}

function setupCategoryFilter() {
    const select = document.getElementById("productCategoryFilter");
    if (!select) return;

    select.addEventListener("change", (e) => {
        productFilterState.categoryId = e.target.value;
        productFilterState.page = 1;
        loadProducts();
    });
}

function toggleDashboardDiscountFilter() {
    productFilterState.onlyDiscounts = !productFilterState.onlyDiscounts;
    productFilterState.page = 1;

    const btn = document.getElementById("btnDashboardDiscountFilter");
    if (btn) {
        if (productFilterState.onlyDiscounts) {
            btn.className = "btn btn-primary btn-sm";
            btn.style.background = "#DC2626";
            btn.style.borderColor = "#DC2626";
            btn.style.color = "#FFFFFF";
            const icon = btn.querySelector("i");
            if (icon) icon.style.color = "#FFFFFF";
        } else {
            btn.className = "btn btn-outline btn-sm";
            btn.style.background = "";
            btn.style.borderColor = "";
            btn.style.color = "";
            const icon = btn.querySelector("i");
            if (icon) icon.style.color = "#DC2626";
        }
    }

    loadProducts();
}

function populateCategoryFilter() {
    const select = document.getElementById("productCategoryFilter");
    if (!select) return;

    const selected = productFilterState.categoryId;
    select.innerHTML = `<option value="all">${i18n.currentLang === "ar" ? "جميع الأقسام" : "All Categories"}</option>` +
        categoriesList.map(c => `
            <option value="${utils.escHtml(c.id)}">${utils.escHtml(i18n.currentLang === "en" ? (c.name_en || c.name_ar) : c.name_ar)}</option>
        `).join("");

    // Preserve selection if it still exists after refresh
    if ([...select.options].some(o => o.value === selected)) {
        select.value = selected;
    }
}

async function loadCategoriesDropdown() {
    try {
        const { data } = await db.getClient()
            .from("categories")
            .select("id, name_ar, name_en")
            .eq("is_active", true);

        categoriesList = data || [];

        const select = document.getElementById("productCategorySelect");
        if (select) {
            select.innerHTML = `<option value="">${i18n.currentLang === "ar" ? "-- اختر القسم --" : "-- Select Category --"}</option>` +
                categoriesList.map(c => `
                    <option value="${utils.escHtml(c.id)}">${utils.escHtml(i18n.currentLang === "en" ? (c.name_en || c.name_ar) : c.name_ar)}</option>
                `).join("");
        }

        populateCategoryFilter();
    } catch (e) {
        console.error("Categories dropdown error:", e);
    }
}

async function onProductCategoryChange() {
    const categoryId = document.getElementById("productCategorySelect").value;
    await loadSubcategoriesDropdown(categoryId);
}

async function loadSubcategoriesDropdown(categoryId, selectedSubcategoryId = "") {
    const select = document.getElementById("productSubcategorySelect");
    if (!select) return;

    if (!categoryId) {
        select.innerHTML = `<option value="">-- بدون فئة فرعية --</option>`;
        return;
    }

    try {
        const { data, error } = await db.getClient()
            .from("subcategories")
            .select("id, name_ar, name_en")
            .eq("category_id", categoryId)
            .eq("is_active", true);

        if (error) throw error;

        const list = data || [];
        select.innerHTML = `<option value="">-- بدون فئة فرعية --</option>` +
            list.map(s => `
                <option value="${utils.escHtml(s.id)}">${utils.escHtml(i18n.currentLang === "en" ? (s.name_en || s.name_ar) : s.name_ar)}</option>
            `).join("");

        if (selectedSubcategoryId) {
            select.value = selectedSubcategoryId;
        }
    } catch (e) {
        console.error("Subcategories dropdown error:", e);
    }
}

async function loadProducts() {
    const tbody = document.getElementById("productsTableBody");
    const emptyState = document.getElementById("emptyProductsState");
    const countBadge = document.getElementById("productsCountBadge");
    const paginationEl = document.getElementById("productsPagination");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 3rem;">${i18n.t("loadingData")}</td></tr>`;

    try {
        const client = db.getClient();
        let query = client
            .from("products")
            .select("*, categories(name_ar, name_en)", { count: "exact" });

        // Category Filter
        if (productFilterState.categoryId && productFilterState.categoryId !== "all") {
            query = query.eq("category_id", productFilterState.categoryId);
        }

        // Search Filter (Arabic or English product name)
        if (productFilterState.searchQuery) {
            const sq = productFilterState.searchQuery.replace(/[,()]/g, " ").trim();
            if (sq) {
                query = query.or(`name_ar.ilike.%${sq}%,name_en.ilike.%${sq}%`);
            }
        }

        // Discount Filter
        if (productFilterState.onlyDiscounts) {
            query = query.not("old_price", "is", null).gt("old_price", 0);
        }

        // Ordering & Pagination
        const from = (productFilterState.page - 1) * productFilterState.pageSize;
        const to = from + productFilterState.pageSize - 1;

        query = query
            .order("created_at", { ascending: false })
            .order("id", { ascending: true })
            .range(from, to);

        const { data, error, count } = await query;
        if (error) throw error;

        productsList = data || [];
        productFilterState.totalCount = count != null ? count : productsList.length;

        renderProductsTable(productsList);
        renderProductPaginationControls();

    } catch (err) {
        console.error("Load products error:", err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #EF4444; padding: 2rem;">${i18n.t("errorGeneric")}</td></tr>`;
        if (paginationEl) paginationEl.innerHTML = "";
    }
}

function renderProductsTable(items = productsList) {
    const tbody = document.getElementById("productsTableBody");
    const emptyState = document.getElementById("emptyProductsState");
    const countBadge = document.getElementById("productsCountBadge");
    if (!tbody) return;

    displayedProducts = items;

    // Only rows that are visible can stay selected, so a bulk action can
    // never touch products the user can't currently see (e.g. after filtering).
    const visibleIds = new Set(items.map(p => p.id));
    selectedProductIds.forEach(id => { if (!visibleIds.has(id)) selectedProductIds.delete(id); });

    if (countBadge) {
        const total = productFilterState.totalCount || items.length;
        const isAr = i18n.currentLang === "ar";
        countBadge.textContent = isAr 
            ? `${total.toLocaleString()} صنف` 
            : `${total.toLocaleString()} Products`;
    }

    if (items.length === 0) {
        tbody.innerHTML = "";
        if (emptyState) emptyState.style.display = "block";
        updateBulkBar();
        return;
    }

    if (emptyState) emptyState.style.display = "none";

    const canEdit = auth.isAdmin();

    tbody.innerHTML = items.map(p => {
        const name = i18n.currentLang === "en" ? (p.name_en || p.name_ar) : p.name_ar;
        const subName = i18n.currentLang === "en" ? p.name_ar : (p.name_en || "");
        const catName = p.categories ? (i18n.currentLang === "en" ? (p.categories.name_en || p.categories.name_ar) : p.categories.name_ar) : "-";
        const price = utils.formatCurrency(p.price);
        const oldPrice = p.old_price ? `<del style="color: var(--text-subtle); font-size: 0.8rem; margin-inline-start: 0.25rem;">${utils.formatCurrency(p.old_price)}</del>` : "";
        const statusBadge = p.is_active 
            ? `<span class="badge badge-active">${i18n.t("activate")}</span>`
            : `<span class="badge badge-inactive">${i18n.t("deactivate")}</span>`;

        const imgHtml = p.image_url 
            ? `<img src="${utils.escHtml(p.image_url)}" alt="${utils.escHtml(name)}" style="width: 44px; height: 44px; object-fit: contain; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">`
            : `<div style="width: 44px; height: 44px; border-radius: var(--radius-sm); background: var(--bg-surface-subtle); display: flex; align-items: center; justify-content: center; color: var(--primary);"><i class="fa-solid ${utils.escHtml(p.icon || 'fa-pills')}"></i></div>`;

        let actionBtns = "-";
        if (canEdit) {
            actionBtns = `
                <div style="display: flex; gap: 0.35rem;">
                    <button class="btn btn-secondary btn-sm" onclick="openEditProductModal('${p.id}')" title="${i18n.t("edit")}">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="btn ${p.is_active ? 'btn-danger' : 'btn-primary'} btn-sm" onclick="toggleProductActive('${p.id}', ${!p.is_active})" title="${p.is_active ? i18n.t("deactivate") : i18n.t("activate")}">
                        <i class="fa-solid ${p.is_active ? 'fa-eye-slash' : 'fa-eye'}"></i>
                    </button>
                </div>
            `;
        }

        const isSelected = selectedProductIds.has(p.id);
        const checkCell = canEdit
            ? `<td><input type="checkbox" class="product-row-check" ${isSelected ? "checked" : ""} onchange="toggleProductSelection('${p.id}', this.checked)" style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary);"></td>`
            : "";

        return `
            <tr data-product-id="${p.id}" ${isSelected ? 'style="background: var(--primary-light);"' : ""}>
                ${checkCell}
                <td>${imgHtml}</td>
                <td>
                    <div style="font-weight: 600;">${utils.escHtml(name)}</div>
                    <small style="color: var(--text-muted);">${utils.escHtml(subName)}</small>
                </td>
                <td><span class="badge badge-delivery">${utils.escHtml(catName)}</span></td>
                <td><strong>${price}</strong> ${oldPrice}</td>
                <td>${statusBadge}</td>
                <td>${actionBtns}</td>
            </tr>
        `;
    }).join("");

    updateBulkBar();
}

function renderProductPaginationControls() {
    const container = document.getElementById("productsPagination");
    if (!container) return;

    const total = productFilterState.totalCount;
    const pageSize = productFilterState.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(Math.max(1, productFilterState.page), totalPages);
    productFilterState.page = currentPage;

    if (total === 0) {
        container.innerHTML = "";
        return;
    }

    const isAr = i18n.currentLang === "ar";
    const startItem = (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(currentPage * pageSize, total);

    // Calculate smart page range to display
    const pages = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
        pages.push(1);
        let leftBound = Math.max(2, currentPage - 2);
        let rightBound = Math.min(totalPages - 1, currentPage + 2);

        if (currentPage <= 4) {
            leftBound = 2;
            rightBound = 5;
        } else if (currentPage >= totalPages - 3) {
            leftBound = totalPages - 4;
            rightBound = totalPages - 1;
        }

        if (leftBound > 2) pages.push("...");
        for (let i = leftBound; i <= rightBound; i++) pages.push(i);
        if (rightBound < totalPages - 1) pages.push("...");
        pages.push(totalPages);
    }

    const prevIcon = isAr ? '<i class="fa-solid fa-chevron-right"></i>' : '<i class="fa-solid fa-chevron-left"></i>';
    const nextIcon = isAr ? '<i class="fa-solid fa-chevron-left"></i>' : '<i class="fa-solid fa-chevron-right"></i>';
    const firstIcon = isAr ? '<i class="fa-solid fa-angles-right"></i>' : '<i class="fa-solid fa-angles-left"></i>';
    const lastIcon = isAr ? '<i class="fa-solid fa-angles-left"></i>' : '<i class="fa-solid fa-angles-right"></i>';

    const pageButtonsHtml = pages.map(p => {
        if (p === "...") {
            return `<span style="padding: 0.35rem 0.5rem; color: var(--text-muted); font-weight: 600;">...</span>`;
        }
        const isActive = p === currentPage;
        return `
            <button type="button" class="btn ${isActive ? 'btn-primary' : 'btn-outline'} btn-sm" 
                    style="min-width: 36px; padding: 0.35rem 0.6rem; font-weight: ${isActive ? '700' : '500'};"
                    onclick="changeProductsPage(${p})" 
                    ${isActive ? 'aria-current="page"' : ''}>
                ${p}
            </button>
        `;
    }).join("");

    container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; padding-top: 1.25rem; border-top: 1px solid var(--border-color);">
            <!-- Summary & Page Size -->
            <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
                <span style="font-size: 0.85rem; color: var(--text-muted);">
                    ${isAr 
                        ? `عرض <strong>${startItem.toLocaleString()}</strong> - <strong>${endItem.toLocaleString()}</strong> من أصل <strong>${total.toLocaleString()}</strong> صنف (صفحة <strong>${currentPage}</strong> من <strong>${totalPages}</strong>)`
                        : `Showing <strong>${startItem.toLocaleString()}</strong> - <strong>${endItem.toLocaleString()}</strong> of <strong>${total.toLocaleString()}</strong> items (Page <strong>${currentPage}</strong> of <strong>${totalPages}</strong>)`}
                </span>

                <div style="display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: var(--text-muted);">
                    <span>${isAr ? "لكل صفحة:" : "Per page:"}</span>
                    <select class="form-control" style="width: auto; padding: 0.25rem 0.6rem; font-size: 0.8rem; height: auto;" onchange="changeProductPageSize(this.value)">
                        <option value="25" ${pageSize === 25 ? "selected" : ""}>25</option>
                        <option value="50" ${pageSize === 50 ? "selected" : ""}>50</option>
                        <option value="100" ${pageSize === 100 ? "selected" : ""}>100</option>
                        <option value="200" ${pageSize === 200 ? "selected" : ""}>200</option>
                    </select>
                </div>
            </div>

            <!-- Page Navigation -->
            <div style="display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;">
                <button type="button" class="btn btn-secondary btn-sm" ${currentPage <= 1 ? "disabled" : ""} onclick="changeProductsPage(1)" title="${isAr ? 'الصفحة الأولى' : 'First page'}">
                    ${firstIcon}
                </button>
                <button type="button" class="btn btn-secondary btn-sm" ${currentPage <= 1 ? "disabled" : ""} onclick="changeProductsPage(${currentPage - 1})" title="${isAr ? 'الصفحة السابقة' : 'Previous page'}">
                    ${prevIcon}
                </button>

                ${pageButtonsHtml}

                <button type="button" class="btn btn-secondary btn-sm" ${currentPage >= totalPages ? "disabled" : ""} onclick="changeProductsPage(${currentPage + 1})" title="${isAr ? 'الصفحة التالية' : 'Next page'}">
                    ${nextIcon}
                </button>
                <button type="button" class="btn btn-secondary btn-sm" ${currentPage >= totalPages ? "disabled" : ""} onclick="changeProductsPage(${totalPages})" title="${isAr ? 'الصفحة الأخيرة' : 'Last page'}">
                    ${lastIcon}
                </button>

                <!-- Direct Jump -->
                <div style="display: inline-flex; align-items: center; gap: 0.3rem; margin-inline-start: 0.5rem;">
                    <input type="number" min="1" max="${totalPages}" id="directPageInput" 
                           placeholder="${currentPage}" 
                           style="width: 60px; padding: 0.25rem 0.4rem; font-size: 0.8rem; text-align: center; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-surface); color: var(--text-main);"
                           onkeydown="if(event.key==='Enter') goToDirectPage(${totalPages})">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="goToDirectPage(${totalPages})" title="${isAr ? 'انتقال' : 'Go'}">
                        ${isAr ? "انتقال" : "Go"}
                    </button>
                </div>
            </div>
        </div>
    `;
}

function changeProductsPage(newPage) {
    const totalPages = Math.max(1, Math.ceil(productFilterState.totalCount / productFilterState.pageSize));
    if (newPage < 1 || newPage > totalPages) return;
    productFilterState.page = newPage;
    loadProducts();
    const card = document.querySelector(".content-card");
    if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
}

function changeProductPageSize(newSize) {
    productFilterState.pageSize = parseInt(newSize, 10) || 50;
    productFilterState.page = 1;
    loadProducts();
}

function goToDirectPage(totalPages) {
    const input = document.getElementById("directPageInput");
    if (!input) return;
    const val = parseInt(input.value, 10);
    if (!isNaN(val) && val >= 1 && val <= totalPages) {
        changeProductsPage(val);
    } else {
        utils.showToast(i18n.currentLang === "ar" ? `يرجى إدخال رقم صفحة بين 1 و ${totalPages}` : `Please enter a page between 1 and ${totalPages}`, "warning");
    }
}

// ==========================================================================
// Bulk selection & bulk actions (admin only)
// ==========================================================================

function toggleProductSelection(productId, checked) {
    if (checked) selectedProductIds.add(productId);
    else selectedProductIds.delete(productId);

    const row = document.querySelector(`#productsTableBody tr[data-product-id="${productId}"]`);
    if (row) row.style.background = checked ? "var(--primary-light)" : "";

    updateBulkBar();
}

function toggleSelectAllProducts(checked) {
    if (checked) displayedProducts.forEach(p => selectedProductIds.add(p.id));
    else displayedProducts.forEach(p => selectedProductIds.delete(p.id));
    renderProductsTable(displayedProducts);
}

function clearProductSelection() {
    selectedProductIds.clear();
    renderProductsTable(displayedProducts);
}

function updateBulkBar() {
    const ar = i18n.currentLang === "ar";
    const bar = document.getElementById("bulkActionsBar");
    const selectAll = document.getElementById("selectAllProducts");
    const count = selectedProductIds.size;

    // Header checkbox: checked = all visible rows ticked, indeterminate = some
    if (selectAll) {
        const total = displayedProducts.length;
        selectAll.checked = total > 0 && count === total;
        selectAll.indeterminate = count > 0 && count < total;
        selectAll.title = ar ? "تحديد الكل" : "Select all";
    }

    if (!bar) return;

    if (count === 0 || !auth.isAdmin()) {
        bar.style.display = "none";
        bar.innerHTML = "";
        return;
    }

    bar.style.cssText = "display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 1rem; padding: 0.7rem 1rem; background: var(--primary-light); border: 1px solid var(--primary); border-radius: var(--radius-md);";
    bar.innerHTML = `
        <strong style="margin-inline-end: auto;">
            <i class="fa-solid fa-square-check" style="color: var(--primary);"></i>
            ${ar ? `تم تحديد ${count} منتج` : `${count} selected`}
        </strong>
        <button class="btn btn-primary btn-sm" onclick="bulkSetProductsActive(true)">
            <i class="fa-solid fa-eye"></i> ${ar ? "تنشيط المحدد" : "Activate selected"}
        </button>
        <button class="btn btn-secondary btn-sm" onclick="bulkSetProductsActive(false)">
            <i class="fa-solid fa-eye-slash"></i> ${ar ? "إلغاء تنشيط المحدد" : "Deactivate selected"}
        </button>
        <button class="btn btn-danger btn-sm" onclick="bulkDeleteProducts()">
            <i class="fa-solid fa-trash"></i> ${ar ? "حذف المحدد نهائياً" : "Delete selected"}
        </button>
        <button class="btn btn-outline btn-sm" onclick="clearProductSelection()">
            <i class="fa-solid fa-xmark"></i> ${ar ? "إلغاء التحديد" : "Clear"}
        </button>
    `;
}

/**
 * Runs one bulk operation ("activate" | "deactivate" | "delete") in chunks
 * (keeps the request URL short) and returns how many rows were really
 * affected — RLS silently skips rows the user isn't allowed to change.
 */
async function runBulkProductOperation(ids, operation) {
    const client = db.getClient();
    const CHUNK = 50;
    let affected = 0;

    for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);

        if (operation === "delete") {
            try {
                const { data: prodsWithImages } = await client
                    .from("products")
                    .select("image_url")
                    .in("id", chunk)
                    .not("image_url", "is", null);
                if (prodsWithImages && prodsWithImages.length > 0) {
                    for (const item of prodsWithImages) {
                        if (item.image_url) {
                            await db.deleteProductImage(item.image_url);
                        }
                    }
                }
            } catch (storageErr) {
                console.warn("Bulk product delete image cleanup error:", storageErr);
            }
        }

        const request = operation === "delete"
            ? client.from("products").delete()
            : client.from("products").update({
                is_active: operation === "activate",
                updated_at: new Date().toISOString()
            });

        const { data, error } = await request.in("id", chunk).select("id");
        if (error) throw error;
        affected += (data || []).length;
    }

    return affected;
}

async function finishBulkOperation(requested, affected) {
    const ar = i18n.currentLang === "ar";
    selectedProductIds.clear();

    if (affected < requested) {
        utils.showToast(
            ar ? `تم تنفيذ العملية على ${affected} من ${requested} منتج فقط، تحقق من الصلاحيات`
               : `Only ${affected} of ${requested} products were updated. Check permissions.`,
            "error"
        );
    } else {
        utils.showToast(i18n.t("saveSuccess"), "success");
    }

    await loadProducts();
}

function bulkSetProductsActive(newStatus) {
    if (!auth.isAdmin()) return;
    const ids = [...selectedProductIds];
    if (ids.length === 0) return;

    const ar = i18n.currentLang === "ar";
    const actionText = newStatus ? i18n.t("activate") : i18n.t("deactivate");
    const msg = ar
        ? `هل أنت متأكد من ${actionText} ${ids.length} منتج؟`
        : `Are you sure you want to ${actionText.toLowerCase()} ${ids.length} products?`;

    utils.showConfirm(i18n.t("confirmDeleteTitle"), msg, async () => {
        try {
            const affected = await runBulkProductOperation(ids, newStatus ? "activate" : "deactivate");
            await finishBulkOperation(ids.length, affected);
        } catch (err) {
            console.error("Bulk toggle products error:", err);
            utils.showToast(i18n.t("errorGeneric"), "error");
        }
    });
}

function bulkDeleteProducts() {
    if (!auth.isAdmin()) return;
    const ids = [...selectedProductIds];
    if (ids.length === 0) return;

    const ar = i18n.currentLang === "ar";
    const msg = ar
        ? `سيتم حذف ${ids.length} منتج نهائياً ولا يمكن التراجع عن ذلك. إذا كنت تريد إخفاءها من الموقع فقط استخدم "إلغاء التنشيط". هل تريد المتابعة؟`
        : `${ids.length} products will be permanently deleted and this cannot be undone. To only hide them from the website use "Deactivate". Continue?`;

    utils.showConfirm(i18n.t("confirmDeleteTitle"), msg, async () => {
        try {
            const affected = await runBulkProductOperation(ids, "delete");
            await finishBulkOperation(ids.length, affected);
        } catch (err) {
            console.error("Bulk delete products error:", err);
            utils.showToast(i18n.t("errorGeneric"), "error");
        }
    });
}

function openAddProductModal() {
    document.getElementById("productForm").reset();
    document.getElementById("productIdInput").value = "";
    document.getElementById("productSubcategorySelect").innerHTML = `<option value="">-- بدون فئة فرعية --</option>`;
    document.getElementById("productModalTitle").textContent = i18n.t("addProduct");

    currentProductImageUrl = null;
    isImageMarkedForDeletion = false;
    clearSelectedProductImage();
    hideProductImagePreview();

    document.getElementById("productModal").classList.add("active");
}

async function openEditProductModal(productId) {
    let p = productsList.find(item => item.id === productId);
    if (!p) {
        try {
            const { data } = await db.getClient().from("products").select("*").eq("id", productId).single();
            p = data;
        } catch (e) {
            console.error("Error finding product for edit:", e);
        }
    }
    if (!p) return;

    document.getElementById("productIdInput").value = p.id;
    document.getElementById("productNameArInput").value = p.name_ar || "";
    document.getElementById("productNameEnInput").value = p.name_en || "";
    document.getElementById("productPriceInput").value = p.price || 0;
    document.getElementById("productOldPriceInput").value = p.old_price || "";
    document.getElementById("productCategorySelect").value = p.category_id || "";
    document.getElementById("productBadgeInput").value = p.badge || "";
    document.getElementById("productInStockInput").checked = p.in_stock !== false;

    // Reset file input & prepare image state
    currentProductImageUrl = p.image_url || null;
    isImageMarkedForDeletion = false;
    const fileInput = document.getElementById("productImageFile");
    if (fileInput) fileInput.value = "";

    if (currentProductImageUrl) {
        showCurrentProductImagePreview(currentProductImageUrl);
    } else {
        hideProductImagePreview();
    }

    loadSubcategoriesDropdown(p.category_id || "", p.subcategory_id || "");

    document.getElementById("productModalTitle").textContent = i18n.t("editProduct");
    document.getElementById("productModal").classList.add("active");
}

function closeProductModal() {
    document.getElementById("productModal").classList.remove("active");
    clearSelectedProductImage();
    hideProductImagePreview();
    currentProductImageUrl = null;
    isImageMarkedForDeletion = false;
}

function setupProductImageInput() {
    const fileInput = document.getElementById("productImageFile");
    if (fileInput) {
        fileInput.addEventListener("change", handleProductImageFileChange);
    }
}

function setupPriceInputsValidation() {
    const priceInputs = [
        document.getElementById("productPriceInput"),
        document.getElementById("productOldPriceInput")
    ];

    priceInputs.forEach(input => {
        if (!input) return;
        input.addEventListener("input", function() {
            if (this.value && this.value.includes(".")) {
                const parts = this.value.split(".");
                if (parts[1] && parts[1].length > 2) {
                    this.value = `${parts[0]}.${parts[1].slice(0, 2)}`;
                }
            }
        });
    });
}

function handleProductImageFileChange(e) {
    const file = e.target.files && e.target.files[0];
    const previewWrap = document.getElementById("productImagePreviewWrap");
    const previewImg = document.getElementById("productImagePreview");
    const statusText = document.getElementById("productImageStatusText");
    const fileNameEl = document.getElementById("productImageFileName");
    const clearBtn = document.getElementById("btnClearSelectedImage");
    const deleteBtn = document.getElementById("btnDeleteProductImage");
    const deleteBtnText = document.getElementById("btnDeleteProductImageText");

    if (!file) {
        if (currentProductImageUrl && !isImageMarkedForDeletion) {
            showCurrentProductImagePreview(currentProductImageUrl);
        } else {
            hideProductImagePreview();
        }
        return;
    }

    if (!file.type.startsWith("image/")) {
        utils.showToast(i18n.currentLang === "ar" ? "يرجى اختيار ملف صورة صالح" : "Please select a valid image file", "error");
        e.target.value = "";
        return;
    }

    const objectUrl = URL.createObjectURL(file);
    if (previewImg) previewImg.src = objectUrl;
    if (statusText) {
        statusText.textContent = i18n.t("newImageSelected");
        statusText.setAttribute("data-i18n", "newImageSelected");
    }
    if (fileNameEl) {
        fileNameEl.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    }
    if (previewWrap) previewWrap.style.display = "flex";
    if (clearBtn) clearBtn.style.display = "inline-flex";
    if (deleteBtn) {
        deleteBtn.style.display = "inline-flex";
        deleteBtn.setAttribute("title", i18n.t("removeSelectedImage"));
        deleteBtn.setAttribute("data-i18n-title", "removeSelectedImage");
    }
    if (deleteBtnText) {
        deleteBtnText.textContent = i18n.t("removeSelectedImage");
        deleteBtnText.setAttribute("data-i18n", "removeSelectedImage");
    }
}

function showCurrentProductImagePreview(url) {
    const previewWrap = document.getElementById("productImagePreviewWrap");
    const previewImg = document.getElementById("productImagePreview");
    const statusText = document.getElementById("productImageStatusText");
    const fileNameEl = document.getElementById("productImageFileName");
    const clearBtn = document.getElementById("btnClearSelectedImage");
    const deleteBtn = document.getElementById("btnDeleteProductImage");
    const deleteBtnText = document.getElementById("btnDeleteProductImageText");

    if (!url) {
        hideProductImagePreview();
        return;
    }

    if (previewImg) previewImg.src = url;
    if (statusText) {
        statusText.textContent = i18n.t("currentImage");
        statusText.setAttribute("data-i18n", "currentImage");
    }
    if (fileNameEl) {
        const cleanName = url.split("/").pop().split("?")[0];
        fileNameEl.textContent = decodeURIComponent(cleanName);
    }
    if (previewWrap) previewWrap.style.display = "flex";
    if (clearBtn) clearBtn.style.display = "none";
    if (deleteBtn) {
        deleteBtn.style.display = "inline-flex";
        deleteBtn.setAttribute("title", i18n.t("deleteImage"));
        deleteBtn.setAttribute("data-i18n-title", "deleteImage");
    }
    if (deleteBtnText) {
        deleteBtnText.textContent = i18n.t("deleteImage");
        deleteBtnText.setAttribute("data-i18n", "deleteImage");
    }
}

function hideProductImagePreview() {
    const previewWrap = document.getElementById("productImagePreviewWrap");
    const previewImg = document.getElementById("productImagePreview");
    const fileNameEl = document.getElementById("productImageFileName");
    const clearBtn = document.getElementById("btnClearSelectedImage");

    if (previewImg) previewImg.src = "";
    if (fileNameEl) fileNameEl.textContent = "";
    if (previewWrap) previewWrap.style.display = "none";
    if (clearBtn) clearBtn.style.display = "none";
}

function clearSelectedProductImage() {
    const fileInput = document.getElementById("productImageFile");
    if (fileInput) fileInput.value = "";

    if (currentProductImageUrl && !isImageMarkedForDeletion) {
        showCurrentProductImagePreview(currentProductImageUrl);
    } else {
        hideProductImagePreview();
    }
}

async function handleDeleteProductImageClick() {
    const fileInput = document.getElementById("productImageFile");
    const hasNewFile = fileInput && fileInput.files && fileInput.files.length > 0;

    // If user currently selected a new file from their device, clear that local selection
    if (hasNewFile) {
        clearSelectedProductImage();
        return;
    }

    // Deleting an existing saved image permanently from Supabase & website
    if (!currentProductImageUrl) return;

    const productId = document.getElementById("productIdInput").value;
    const confirmMsg = i18n.t("deleteImageConfirm");

    utils.showConfirm(i18n.t("deleteImage"), confirmMsg, async () => {
        const deleteBtn = document.getElementById("btnDeleteProductImage");
        const deleteBtnText = document.getElementById("btnDeleteProductImageText");
        const originalText = deleteBtnText ? deleteBtnText.textContent : "";

        if (deleteBtn) deleteBtn.disabled = true;
        if (deleteBtnText) deleteBtnText.textContent = i18n.t("deletingImage");

        try {
            const imgToDelete = currentProductImageUrl;

            // 1. Permanently delete from Supabase storage bucket
            await db.deleteProductImage(imgToDelete);

            // 2. If product exists in database, clear its image_url
            if (productId) {
                const { error } = await db.getClient()
                    .from("products")
                    .update({
                        image_url: null,
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", productId);

                if (error) throw error;

                // Update product in-memory cache
                const prod = productsList.find(item => item.id === productId);
                if (prod) {
                    prod.image_url = null;
                }
                renderProductsTable();
            }

            // 3. Reset image state in modal
            currentProductImageUrl = null;
            isImageMarkedForDeletion = true;
            if (fileInput) fileInput.value = "";
            hideProductImagePreview();

            utils.showToast(i18n.t("imageDeletedSuccess"), "success");
        } catch (err) {
            console.error("Failed to delete product image:", err);
            utils.showToast(i18n.t("errorGeneric"), "error");
        } finally {
            if (deleteBtn) deleteBtn.disabled = false;
            if (deleteBtnText) deleteBtnText.textContent = originalText || i18n.t("deleteImage");
        }
    });
}

function updateProductModalImageLabels() {
    const fileInput = document.getElementById("productImageFile");
    const hasNewFile = fileInput && fileInput.files && fileInput.files.length > 0;
    const deleteBtn = document.getElementById("btnDeleteProductImage");
    const deleteBtnText = document.getElementById("btnDeleteProductImageText");
    const clearBtn = document.getElementById("btnClearSelectedImage");
    const statusText = document.getElementById("productImageStatusText");

    if (clearBtn) {
        clearBtn.setAttribute("title", i18n.t("removeSelectedImage"));
    }

    if (hasNewFile) {
        if (statusText) statusText.textContent = i18n.t("newImageSelected");
        if (deleteBtn) deleteBtn.setAttribute("title", i18n.t("removeSelectedImage"));
        if (deleteBtnText) deleteBtnText.textContent = i18n.t("removeSelectedImage");
    } else if (currentProductImageUrl && !isImageMarkedForDeletion) {
        if (statusText) statusText.textContent = i18n.t("currentImage");
        if (deleteBtn) deleteBtn.setAttribute("title", i18n.t("deleteImage"));
        if (deleteBtnText) deleteBtnText.textContent = i18n.t("deleteImage");
    }
}

async function handleProductFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById("productIdInput").value;
    const nameAr = document.getElementById("productNameArInput").value.trim();
    const nameEn = document.getElementById("productNameEnInput").value.trim();
    const priceVal = parseFloat(document.getElementById("productPriceInput").value);
    const price = isNaN(priceVal) ? NaN : parseFloat(priceVal.toFixed(2));
    const oldPriceRaw = document.getElementById("productOldPriceInput").value;
    const oldPrice = oldPriceRaw && !isNaN(parseFloat(oldPriceRaw)) ? parseFloat(parseFloat(oldPriceRaw).toFixed(2)) : null;
    const categoryId = document.getElementById("productCategorySelect").value || null;
    const subcategoryId = document.getElementById("productSubcategorySelect").value || null;
    const badge = document.getElementById("productBadgeInput").value.trim() || null;
    const inStock = document.getElementById("productInStockInput").checked;
    const fileInput = document.getElementById("productImageFile");

    if (!nameAr || isNaN(price)) {
        utils.showToast(i18n.currentLang === "ar" ? "يرجى كتابة اسم المنتج وتحديد السعر" : "Please provide name and price", "error");
        return;
    }

    const saveBtn = document.getElementById("saveProductBtn");
    saveBtn.disabled = true;
    saveBtn.textContent = i18n.t("savingData");

    try {
        let imageUrl = null;
        const oldImageUrl = currentProductImageUrl;

        if (fileInput && fileInput.files && fileInput.files[0]) {
            imageUrl = await db.uploadProductImage(fileInput.files[0]);
            // If replacing an existing image with a newly uploaded one, clean up the old file from Supabase storage
            if (oldImageUrl && oldImageUrl !== imageUrl) {
                await db.deleteProductImage(oldImageUrl);
            }
        }

        const payload = {
            name_ar: nameAr,
            name_en: nameEn,
            price: price,
            old_price: oldPrice,
            category_id: categoryId,
            subcategory_id: subcategoryId,
            badge: badge,
            in_stock: inStock,
            updated_at: new Date().toISOString()
        };

        if (imageUrl) {
            payload.image_url = imageUrl;
        } else if (isImageMarkedForDeletion) {
            payload.image_url = null;
        }

        const client = db.getClient();
        if (id) {
            const { error } = await client.from("products").update(payload).eq("id", id);
            if (error) throw error;
        } else {
            payload.is_active = true;
            const { error } = await client.from("products").insert(payload);
            if (error) throw error;
        }

        utils.showToast(i18n.t("saveSuccess"), "success");
        closeProductModal();
        await loadProducts();

    } catch (err) {
        console.error("Save product error:", err);
        const detail = err && err.message ? err.message : "";
        utils.showToast(
            detail ? `${i18n.t("errorGeneric")} — ${detail}` : i18n.t("errorGeneric"),
            "error"
        );
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = i18n.t("save");
    }
}

async function toggleProductActive(productId, newStatus) {
    const actionText = newStatus ? i18n.t("activate") : i18n.t("deactivate");
    const confirmMsg = i18n.currentLang === "ar"
        ? `هل أنت متأكد من رغبتك في ${actionText} هذا المنتج؟`
        : `Are you sure you want to ${actionText.toLowerCase()} this product?`;

    utils.showConfirm(i18n.t("confirmDeleteTitle"), confirmMsg, async () => {
        try {
            const { error } = await db.getClient()
                .from("products")
                .update({ is_active: newStatus })
                .eq("id", productId);

            if (error) throw error;

            utils.showToast(i18n.t("saveSuccess"), "success");
            await loadProducts();
        } catch (err) {
            console.error("Toggle product error:", err);
            utils.showToast(i18n.t("errorGeneric"), "error");
        }
    });
}

// ==========================================================================
// Excel Bulk Import & Template
// ==========================================================================

// Documented column order for the Excel template (row 1 = headers ignored,
// data starts from row 2):
// 0  name_ar     اسم المنتج (بالعربية) - إجباري
// 1  name_en     اسم المنتج (بالإنجليزية) - إجباري
// 2  description الوصف
// 3  price       السعر (ج.م) - إجباري
// 4  old_price   السعر قبل الخصم
// 5  category    القسم (اسم القسم بالعربي أو الإنجليزي)
// 6  badge       الشارة
// 7  badge_type  نوع الشارة (official/sale/new/bestseller)
// 8  icon        الأيقونة (مثل fa-pills)
// 9  in_stock    متوفر بالمخزون (نعم/TRUE/1 أو لا/FALSE/0)
// 10 is_active   مفعل (نعم/TRUE/1 أو لا/FALSE/0)

const PRODUCT_EXCEL_COLUMNS = ["name_ar", "name_en", "description", "price", "old_price", "category", "badge", "badge_type", "icon", "in_stock", "is_active"];

const PRODUCT_EXCEL_HEADERS = [
    "اسم المنتج (بالعربية) *",
    "اسم المنتج (بالإنجليزية) *",
    "الوصف",
    "السعر (ج.م) *",
    "السعر قبل الخصم",
    "القسم / التصنيف",
    "الشارة",
    "نوع الشارة",
    "الأيقونة",
    "متوفر بالمخزون",
    "مفعل"
];

function downloadProductTemplate() {
    if (typeof XLSX === "undefined") {
        utils.showToast(i18n.currentLang === "ar" ? "مكتبة الإكسل غير متاحة" : "Excel library unavailable", "error");
        return;
    }

    const data = [PRODUCT_EXCEL_HEADERS];
    // One sample row to illustrate
    data.push(["بنادول إكسترا", "Panadol Extra", "مسكن للصداع", "45", "50", "الأدوية والعلاجات", "الأكثر طلباً", "official", "fa-pills", "نعم", "نعم"]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [
        { wch: 22 }, { wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 14 },
        { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "المنتجات");
    XLSX.writeFile(wb, "قوالب_المنتجات.xlsx");
}

function handleProductExcelImport(file) {
    if (!file) return;

    if (typeof XLSX === "undefined") {
        utils.showToast(i18n.currentLang === "ar" ? "مكتبة الإكسل غير متاحة" : "Excel library unavailable", "error");
        return;
    }

    const validExtensions = ["xlsx", "xls", "csv"];
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!validExtensions.includes(ext)) {
        utils.showToast(i18n.currentLang === "ar" ? "من فضلك اختر ملف إكسل (.xlsx أو .xls)" : "Please choose an Excel file (.xlsx or .xls)", "error");
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const wb = XLSX.read(e.target.result, { type: "array" });
            const ws = wb.Sheets[wb.SheetNames[0]];
            if (!ws) {
                utils.showToast(i18n.currentLang === "ar" ? "الملف فارغ" : "The file is empty", "error");
                return;
            }

            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
            // Drop the header row
            const dataRows = rows.slice(1);

            if (dataRows.length === 0) {
                utils.showToast(i18n.currentLang === "ar" ? "لا توجد صفوف بيانات في الملف" : "No data rows found", "error");
                return;
            }

            parseAndImportProducts(dataRows);
        } catch (err) {
            console.error("Excel parse error:", err);
            utils.showToast(i18n.currentLang === "ar" ? "تعذر قراءة الملف، تأكد من أنه ملف إكسل صالح" : "Could not read the file", "error");
        }
    };
    reader.readAsArrayBuffer(file);
}

function toBool(val) {
    const s = String(val || "").trim().toLowerCase();
    return s === "نعم" || s === "true" || s === "1" || s === "yes" || s === "متاح";
}

function categoryNameToId(name) {
    if (!name) return null;
    const n = String(name).trim().toLowerCase();
    const found = categoriesList.find(c =>
        (c.name_ar || "").trim().toLowerCase() === n ||
        (c.name_en || "").trim().toLowerCase() === n
    );
    return found ? found.id : null;
}

function parseAndImportProducts(dataRows) {
    const validRows = [];
    const errors = []; // { row, product, reason }

    dataRows.forEach((row, idx) => {
        const rowNum = idx + 2; // +2 because row 1 is the header

        const rawNameAr = String(row[0] || "").trim();
        const rawNameEn = String(row[1] || "").trim();
        const rawPrice = String(row[3] || "").trim();

        if (!rawNameAr) {
            errors.push({ row: rowNum, product: rawNameAr || "—", reason: "اسم المنتج (بالعربية) مطلوب" });
            return;
        }

        if (!rawNameEn) {
            errors.push({ row: rowNum, product: rawNameAr || "—", reason: "اسم المنتج (بالإنجليزية) مطلوب" });
            return;
        }

        const price = parseFloat(rawPrice);
        if (isNaN(price) || price < 0) {
            errors.push({ row: rowNum, product: rawNameAr, reason: "السعر غير صحيح / مطلوب" });
            return;
        }

        const categoryId = categoryNameToId(row[5]);
        if (row[5] && !categoryId) {
            errors.push({ row: rowNum, product: rawNameAr, reason: `القسم غير موجود: "${row[5]}"` });
            return;
        }

        const oldPriceRaw = String(row[4] || "").trim();
        const oldPrice = oldPriceRaw ? parseFloat(oldPriceRaw) : null;
        if (oldPriceRaw && isNaN(oldPriceRaw)) {
            errors.push({ row: rowNum, product: rawNameAr, reason: "السعر قبل الخصم غير صحيح" });
            return;
        }

        validRows.push({
            name_ar: rawNameAr,
            name_en: String(row[1] || "").trim() || null,
            description: String(row[2] || "").trim() || null,
            price: parseFloat(price.toFixed(2)),
            old_price: Number.isFinite(oldPrice) ? parseFloat(oldPrice.toFixed(2)) : null,
            category_id: categoryId || null,
            badge: String(row[6] || "").trim() || null,
            badge_type: String(row[7] || "").trim() || "official",
            icon: String(row[8] || "").trim() || "fa-pills",
            in_stock: String(row[9] || "").trim() === "" ? true : toBool(row[9]),
            is_active: String(row[10] || "").trim() === "" ? true : toBool(row[10]),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
    });

    if (validRows.length === 0) {
        showProductImportResults(0, errors);
        return;
    }

    importProductBatches(validRows, errors);
}

async function importProductBatches(rows, errors) {
    const client = db.getClient();
    const CHUNK = 100;
    let inserted = 0;

    utils.showToast(
        i18n.currentLang === "ar" ? "جاري رفع المنتجات..." : "Importing products...",
        "info"
    );

    try {
        for (let i = 0; i < rows.length; i += CHUNK) {
            const chunk = rows.slice(i, i + CHUNK);
            const { error } = await client.from("products").insert(chunk);
            if (error) throw error;
            inserted += chunk.length;
        }

        await loadProducts();
        await loadCategoriesDropdown(); // ensure filter reflects any new categories
        showProductImportResults(inserted, errors, rows.length);
    } catch (err) {
        console.error("Product import error:", err);
        const allFailed = rows.map((r, idx) => ({ row: idx + 2, product: r.name_ar, reason: "فشل الإدراج في قاعدة البيانات" }));
        showProductImportResults(0, allFailed, rows.length);
    }
}

function showProductImportResults(inserted, errors, total) {
    const modal = document.getElementById("productImportModal");
    if (!modal) {
        utils.showToast(i18n.currentLang === "ar" ? "تم رفع المنتجات" : "Products imported", "success");
        return;
    }

    const summary = document.getElementById("productImportSummary");
    const wrap = document.getElementById("productImportTableWrap");
    const body = document.getElementById("productImportTableBody");

    const failed = errors.length;
    const ar = i18n.currentLang === "ar";
    summary.innerHTML =
        `✅ ${ar ? `تم استيراد ${inserted} منتج بنجاح` : `Successfully imported ${inserted} products`}` +
        (failed > 0 ? ` &nbsp; ⚠️ ${ar ? `${failed} صف خاطئ` : `${failed} invalid rows`}` : "");

    if (failed > 0) {
        body.innerHTML = errors.map(err => `
            <tr>
                <td>${err.product}</td>
                <td style="color: #EF4444;">${err.reason} (${ar ? "صف" : "Row"} ${err.row})</td>
            </tr>
        `).join("");
        wrap.style.display = "block";
    } else {
        wrap.style.display = "none";
    }

    modal.classList.add("active");
}

// ==========================================================================
// Manifest CSV Image Sync Logic
// ==========================================================================

function closeManifestSyncModal() {
    const modal = document.getElementById("manifestSyncModal");
    if (modal) modal.classList.remove("active");
    const fileInput = document.getElementById("manifestCsvFileInput");
    if (fileInput) fileInput.value = "";
}

function normalizeProductKey(name) {
    if (!name) return "";
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function parseCSVLine(line) {
    const values = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (inQuote && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuote = !inQuote;
            }
        } else if (c === ',' && !inQuote) {
            values.push(cur.trim());
            cur = "";
        } else {
            cur += c;
        }
    }
    values.push(cur.trim());
    return values;
}

async function handleManifestCsvUpload(file) {
    if (!file) return;

    const modal = document.getElementById("manifestSyncModal");
    const titleEl = document.getElementById("manifestSyncModalTitle");
    const statusText = document.getElementById("manifestSyncStatusText");
    const progressBar = document.getElementById("manifestSyncProgressBar");
    const updatedCountEl = document.getElementById("manifestSyncUpdatedCount");
    const skippedCountEl = document.getElementById("manifestSyncSkippedCount");
    const unmatchedCountEl = document.getElementById("manifestSyncUnmatchedCount");
    const logEl = document.getElementById("manifestSyncLog");
    const doneBtn = document.getElementById("manifestSyncDoneBtn");
    const closeBtn = document.getElementById("manifestSyncModalCloseBtn");

    if (modal) modal.classList.add("active");
    if (doneBtn) doneBtn.style.display = "none";
    if (closeBtn) closeBtn.style.display = "none";
    if (progressBar) progressBar.style.width = "0%";
    if (updatedCountEl) updatedCountEl.textContent = "0";
    if (skippedCountEl) skippedCountEl.textContent = "0";
    if (unmatchedCountEl) unmatchedCountEl.textContent = "0";
    if (logEl) logEl.innerHTML = `<div>📂 تم اختيار الملف: <b>${utils.escHtml(file.name)}</b></div>`;

    try {
        statusText.textContent = "جاري قراءة ملف المانيفست...";
        const text = await file.text();
        const rawLines = text.split(/\r?\n/).filter(l => l.trim().length > 0);

        if (rawLines.length <= 1) {
            statusText.textContent = "الملف فارغ أو لا يحتوي على صفوف بيانات.";
            if (doneBtn) doneBtn.style.display = "inline-block";
            if (closeBtn) closeBtn.style.display = "inline-block";
            return;
        }

        // Parse header
        const header = parseCSVLine(rawLines[0]).map(h => h.toLowerCase());
        const engIdx = header.indexOf("english_name");
        const fileIdx = header.indexOf("file_name");
        const statusIdx = header.indexOf("status");

        if (engIdx === -1 || fileIdx === -1) {
            statusText.textContent = "خطأ: الملف لا يحتوي على أعمدة english_name و file_name المطلوبة.";
            if (doneBtn) doneBtn.style.display = "inline-block";
            if (closeBtn) closeBtn.style.display = "inline-block";
            return;
        }

        // Build image lookup map from manifest
        const manifestMap = new Map();
        for (let i = 1; i < rawLines.length; i++) {
            const cols = parseCSVLine(rawLines[i]);
            const engName = cols[engIdx] || "";
            const fileName = cols[fileIdx] || "";
            const st = (cols[statusIdx] || "ok").toLowerCase();

            if (engName && fileName && st === "ok") {
                const key = normalizeProductKey(engName);
                if (key && !manifestMap.has(key)) {
                    manifestMap.set(key, fileName);
                }
            }
        }

        logEl.innerHTML += `<div>✅ تم العثور على <b>${manifestMap.size}</b> صورة جاهزة في المانيفست.</div>`;
        statusText.textContent = "جاري جلب قائمة المنتجات من قاعدة البيانات...";

        // Fetch ALL products from database using pagination (Supabase default max rows is 1000 per request)
        const client = db.getClient();
        let dbProducts = [];
        let fromIdx = 0;
        const PAGE_STEP = 1000;
        let hasMore = true;

        while (hasMore) {
            statusText.textContent = `جاري جلب المنتجات من قاعدة البيانات (${dbProducts.length})...`;
            const { data: pageRows, error: dbError } = await client
                .from("products")
                .select("id, name_en, name_ar, image_url")
                .range(fromIdx, fromIdx + PAGE_STEP - 1);

            if (dbError) throw dbError;

            if (pageRows && pageRows.length > 0) {
                dbProducts.push(...pageRows);
                fromIdx += PAGE_STEP;
                if (pageRows.length < PAGE_STEP) {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        }

        const totalProds = dbProducts.length;
        logEl.innerHTML += `<div>📦 إجمالي المنتجات في قاعدة البيانات: <b>${totalProds}</b> منتج.</div>`;

        // Bucket Public URL Prefix
        const storageBase = `${CONFIG.SUPABASE_URL}/storage/v1/object/public/${CONFIG.STORAGE_BUCKETS.PRODUCT_IMAGES}/`;

        let updated = 0;
        let skippedManual = 0;
        let unmatched = 0;

        const updatesToApply = [];

        for (const prod of (dbProducts || [])) {
            // Check if product already has a manual image
            if (prod.image_url && prod.image_url.trim() !== "") {
                skippedManual++;
                continue;
            }

            // Attempt to match by name_en
            let matchedFileName = null;
            if (prod.name_en) {
                const key = normalizeProductKey(prod.name_en);
                if (manifestMap.has(key)) {
                    matchedFileName = manifestMap.get(key);
                }
            }

            // Fallback match by name_ar if english was empty or didn't match
            if (!matchedFileName && prod.name_ar) {
                const keyAr = normalizeProductKey(prod.name_ar);
                if (manifestMap.has(keyAr)) {
                    matchedFileName = manifestMap.get(keyAr);
                }
            }

            if (matchedFileName) {
                const publicUrl = `${storageBase}${matchedFileName}`;
                updatesToApply.push({ id: prod.id, image_url: publicUrl, name: prod.name_ar || prod.name_en });
            } else {
                unmatched++;
            }
        }

        if (skippedCountEl) skippedCountEl.textContent = skippedManual;
        if (unmatchedCountEl) unmatchedCountEl.textContent = unmatched;

        logEl.innerHTML += `<div>🎯 تم مطابقة <b>${updatesToApply.length}</b> منتج جديد للربط. سيتم حفظ التعديلات...</div>`;
        logEl.scrollTop = logEl.scrollHeight;

        // Apply updates in batches to avoid overwhelming the network
        const BATCH_SIZE = 25;
        const totalToUpdate = updatesToApply.length;

        for (let i = 0; i < totalToUpdate; i += BATCH_SIZE) {
            const batch = updatesToApply.slice(i, i + BATCH_SIZE);
            await Promise.all(
                batch.map(item =>
                    client
                        .from("products")
                        .update({ image_url: item.image_url })
                        .eq("id", item.id)
                )
            );

            updated += batch.length;
            if (updatedCountEl) updatedCountEl.textContent = updated;

            const pct = Math.min(100, Math.round((updated / (totalToUpdate || 1)) * 100));
            if (progressBar) progressBar.style.width = `${pct}%`;
            statusText.textContent = `جاري حفظ الروابط: ${updated} من ${totalToUpdate} (${pct}%)...`;
        }

        statusText.textContent = "🎉 اكتملت عملية ربط الصور بنجاح!";
        if (progressBar) progressBar.style.width = "100%";
        logEl.innerHTML += `<div style="color: #059669; font-weight: bold;">🎉 تم الانتهاء! تم تحديث ${updated} منتج، وتخطي ${skippedManual} منتج بحفظ صورهم اليدوية السابقة.</div>`;
        logEl.scrollTop = logEl.scrollHeight;

        await loadProducts();

    } catch (err) {
        console.error("Manifest sync error:", err);
        statusText.textContent = `حدث خطأ أثناء المعالجة: ${err.message || err}`;
        logEl.innerHTML += `<div style="color: #EF4444;">❌ خطأ: ${utils.escHtml(err.message || String(err))}</div>`;
    } finally {
        if (doneBtn) doneBtn.style.display = "inline-block";
        if (closeBtn) closeBtn.style.display = "inline-block";
    }
}
