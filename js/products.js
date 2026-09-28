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
    categoryId: "all"
};

document.addEventListener("DOMContentLoaded", async () => {
    utils.setupMobileSidebar();

    const isAuthed = await auth.init();
    if (!isAuthed) return;

    notifications.init();
    await loadCategoriesDropdown();
    await loadProducts();
    setupProductSearch();
    setupCategoryFilter();

    window.onLanguageChange = () => {
        applyProductFilters();
        loadCategoriesDropdown();
    };
});

function applyProductFilters() {
    const q = productFilterState.searchQuery.toLowerCase();
    const catId = productFilterState.categoryId;
    const filtered = productsList.filter(p => {
        const matchesSearch =
            !q ||
            (p.name_ar && p.name_ar.toLowerCase().includes(q)) ||
            (p.name_en && p.name_en.toLowerCase().includes(q));
        const matchesCategory = catId === "all" || p.category_id === catId;
        return matchesSearch && matchesCategory;
    });
    renderProductsTable(filtered);
}

function setupProductSearch() {
    const input = document.getElementById("productSearchInput");
    if (!input) return;

    input.addEventListener("input", (e) => {
        productFilterState.searchQuery = e.target.value.trim().toLowerCase();
        applyProductFilters();
    });
}

function setupCategoryFilter() {
    const select = document.getElementById("productCategoryFilter");
    if (!select) return;

    select.addEventListener("change", (e) => {
        productFilterState.categoryId = e.target.value;
        applyProductFilters();
    });
}

function populateCategoryFilter() {
    const select = document.getElementById("productCategoryFilter");
    if (!select) return;

    const selected = productFilterState.categoryId;
    select.innerHTML = `<option value="all">${i18n.currentLang === "ar" ? "جميع الأقسام" : "All Categories"}</option>` +
        categoriesList.map(c => `
            <option value="${c.id}">${i18n.currentLang === "en" ? (c.name_en || c.name_ar) : c.name_ar}</option>
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
                    <option value="${c.id}">${i18n.currentLang === "en" ? (c.name_en || c.name_ar) : c.name_ar}</option>
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
                <option value="${s.id}">${i18n.currentLang === "en" ? (s.name_en || s.name_ar) : s.name_ar}</option>
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
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 3rem;">${i18n.t("loadingData")}</td></tr>`;

    try {
        const client = db.getClient();
        const { data, error } = await client
            .from("products")
            .select("*, categories(name_ar, name_en)")
            .order("created_at", { ascending: false });

        if (error) throw error;

        productsList = data || [];
        applyProductFilters();

    } catch (err) {
        console.error("Load products error:", err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #EF4444; padding: 2rem;">${i18n.t("errorGeneric")}</td></tr>`;
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

    if (countBadge) countBadge.textContent = `${items.length} ${i18n.t("navProducts")}`;

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
            ? `<img src="${p.image_url}" alt="${name}" style="width: 44px; height: 44px; object-fit: contain; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">`
            : `<div style="width: 44px; height: 44px; border-radius: var(--radius-sm); background: var(--bg-surface-subtle); display: flex; align-items: center; justify-content: center; color: var(--primary);"><i class="fa-solid ${p.icon || 'fa-pills'}"></i></div>`;

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
                    <div style="font-weight: 600;">${name}</div>
                    <small style="color: var(--text-muted);">${subName}</small>
                </td>
                <td><span class="badge badge-delivery">${catName}</span></td>
                <td><strong>${price}</strong> ${oldPrice}</td>
                <td>${statusBadge}</td>
                <td>${actionBtns}</td>
            </tr>
        `;
    }).join("");

    updateBulkBar();
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
    document.getElementById("productModal").classList.add("active");
}

function openEditProductModal(productId) {
    const p = productsList.find(item => item.id === productId);
    if (!p) return;

    document.getElementById("productIdInput").value = p.id;
    document.getElementById("productNameArInput").value = p.name_ar || "";
    document.getElementById("productNameEnInput").value = p.name_en || "";
    document.getElementById("productPriceInput").value = p.price || 0;
    document.getElementById("productOldPriceInput").value = p.old_price || "";
    document.getElementById("productCategorySelect").value = p.category_id || "";
    document.getElementById("productBadgeInput").value = p.badge || "";
    document.getElementById("productInStockInput").checked = p.in_stock !== false;

    loadSubcategoriesDropdown(p.category_id || "", p.subcategory_id || "");

    document.getElementById("productModalTitle").textContent = i18n.t("editProduct");
    document.getElementById("productModal").classList.add("active");
}

function closeProductModal() {
    document.getElementById("productModal").classList.remove("active");
}

async function handleProductFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById("productIdInput").value;
    const nameAr = document.getElementById("productNameArInput").value.trim();
    const nameEn = document.getElementById("productNameEnInput").value.trim();
    const price = parseFloat(document.getElementById("productPriceInput").value);
    const oldPrice = parseFloat(document.getElementById("productOldPriceInput").value) || null;
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
        if (fileInput && fileInput.files && fileInput.files[0]) {
            imageUrl = await db.uploadProductImage(fileInput.files[0]);
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
        // Surface the real database message — "حدث خطأ غير متوقع" alone
        // hides things like a missing column (42703) or a blocked insert (42501).
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
            price: price,
            old_price: Number.isFinite(oldPrice) ? oldPrice : null,
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
