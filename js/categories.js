// ==========================================================================
// صيدلية د.مصطفى فتحي حامد (Dr.Mostafa Fathy Hamed Pharmacy) - Categories Management Controller
// ==========================================================================

let categoriesList = [];

document.addEventListener("DOMContentLoaded", async () => {
    utils.setupMobileSidebar();

    const isAuthed = await auth.init();
    if (!isAuthed) return;

    notifications.init();
    await loadCategories();

    window.onLanguageChange = () => renderCategoriesTable();
});

async function loadCategories() {
    const tbody = document.getElementById("categoriesTableBody");
    const emptyState = document.getElementById("emptyCategoriesState");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 3rem;">${i18n.t("loadingData")}</td></tr>`;

    try {
        const client = db.getClient();
        const { data, error } = await client
            .from("categories")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;

        categoriesList = data || [];
        renderCategoriesTable();

    } catch (err) {
        console.error("Load categories error:", err);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #EF4444; padding: 2rem;">${i18n.t("errorGeneric")}</td></tr>`;
    }
}

function renderCategoriesTable() {
    const tbody = document.getElementById("categoriesTableBody");
    const emptyState = document.getElementById("emptyCategoriesState");
    const countBadge = document.getElementById("categoriesCountBadge");
    if (!tbody) return;

    if (countBadge) countBadge.textContent = `${categoriesList.length} ${i18n.t("navCategories")}`;

    if (categoriesList.length === 0) {
        tbody.innerHTML = "";
        if (emptyState) emptyState.style.display = "block";
        return;
    }

    if (emptyState) emptyState.style.display = "none";

    const canEdit = auth.isAdmin();

    tbody.innerHTML = categoriesList.map(cat => {
        const name = i18n.currentLang === "en" ? (cat.name_en || cat.name_ar) : cat.name_ar;
        const subName = i18n.currentLang === "en" ? cat.name_ar : (cat.name_en || "-");
        const statusBadge = cat.is_active 
            ? `<span class="badge badge-active">${i18n.t("activate")}</span>`
            : `<span class="badge badge-inactive">${i18n.t("deactivate")}</span>`;

        let actionBtns = "-";
        if (canEdit) {
            actionBtns = `
                <div style="display: flex; gap: 0.35rem;">
                    <button class="btn btn-secondary btn-sm" onclick="openEditCategoryModal('${cat.id}')" title="${i18n.t("edit")}">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="btn ${cat.is_active ? 'btn-danger' : 'btn-primary'} btn-sm" onclick="toggleCategoryActive('${cat.id}', ${!cat.is_active})" title="${cat.is_active ? i18n.t("deactivate") : i18n.t("activate")}">
                        <i class="fa-solid ${cat.is_active ? 'fa-eye-slash' : 'fa-eye'}"></i>
                    </button>
                </div>
            `;
        }

        return `
            <tr>
                <td>
                    <button class="btn btn-icon btn-sm" onclick="toggleCategoryExpand('${cat.id}')" id="expandBtn-${cat.id}" title="عرض الفئات الفرعية">
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>
                    <strong>${utils.escHtml(name)}</strong>
                </td>
                <td><small style="color: var(--text-muted);">${utils.escHtml(subName)}</small></td>
                <td><code>${utils.escHtml(cat.slug)}</code></td>
                <td>${statusBadge}</td>
                <td>${actionBtns}</td>
            </tr>
            <tr id="subcatRow-${cat.id}" style="display: none;">
                <td colspan="5" style="background: var(--bg-surface-subtle); padding: 1rem 1.5rem;">
                    <div id="subcatContainer-${cat.id}">
                        <p style="color: var(--text-muted); font-size: 0.85rem;">${i18n.t("loadingData")}</p>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

// --------------------------------------------------------------------------
// Subcategories (nested inside each category row)
// --------------------------------------------------------------------------
const subcategoriesCache = {}; // categoryId -> array of subcategory rows, loaded lazily
const expandedCategories = {}; // categoryId -> boolean

async function toggleCategoryExpand(categoryId) {
    const row = document.getElementById(`subcatRow-${categoryId}`);
    const btn = document.getElementById(`expandBtn-${categoryId}`);
    if (!row) return;

    const isOpen = expandedCategories[categoryId];
    expandedCategories[categoryId] = !isOpen;

    if (isOpen) {
        row.style.display = "none";
        if (btn) btn.querySelector("i").className = "fa-solid fa-chevron-down";
        return;
    }

    row.style.display = "table-row";
    if (btn) btn.querySelector("i").className = "fa-solid fa-chevron-up";

    if (!subcategoriesCache[categoryId]) {
        await loadSubcategoriesForCategory(categoryId);
    }
}

async function loadSubcategoriesForCategory(categoryId) {
    const container = document.getElementById(`subcatContainer-${categoryId}`);
    if (!container) return;

    try {
        const { data, error } = await db.getClient()
            .from("subcategories")
            .select("*")
            .eq("category_id", categoryId)
            .order("created_at", { ascending: true });

        if (error) throw error;

        subcategoriesCache[categoryId] = data || [];
        renderSubcategoriesForCategory(categoryId);

    } catch (err) {
        console.error("Load subcategories error:", err);
        container.innerHTML = `<p style="color: #EF4444; font-size: 0.85rem;">${i18n.t("errorGeneric")}</p>`;
    }
}

function renderSubcategoriesForCategory(categoryId) {
    const container = document.getElementById(`subcatContainer-${categoryId}`);
    if (!container) return;

    const list = subcategoriesCache[categoryId] || [];
    const canEdit = auth.isAdmin();

    const addBtnHtml = canEdit ? `
        <button class="btn btn-primary btn-sm" onclick="openAddSubcategoryModal('${categoryId}')" style="margin-bottom: 0.75rem;">
            <i class="fa-solid fa-plus"></i> إضافة فئة فرعية
        </button>
    ` : "";

    if (list.length === 0) {
        container.innerHTML = `
            ${addBtnHtml}
            <p style="color: var(--text-muted); font-size: 0.85rem;">لا توجد فئات فرعية لهذا القسم بعد.</p>
        `;
        return;
    }

    const rowsHtml = list.map(s => {
        const statusBadge = s.is_active
            ? `<span class="badge badge-active">${i18n.t("activate")}</span>`
            : `<span class="badge badge-inactive">${i18n.t("deactivate")}</span>`;

        const actionBtns = canEdit ? `
            <button class="btn btn-secondary btn-sm" onclick="openEditSubcategoryModal('${categoryId}', '${s.id}')" title="${i18n.t("edit")}">
                <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn ${s.is_active ? 'btn-danger' : 'btn-primary'} btn-sm" onclick="toggleSubcategoryActive('${categoryId}', '${s.id}', ${!s.is_active})" title="${s.is_active ? i18n.t("deactivate") : i18n.t("activate")}">
                <i class="fa-solid ${s.is_active ? 'fa-eye-slash' : 'fa-eye'}"></i>
            </button>
        ` : "-";

        return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0; border-bottom: 1px dashed var(--border-color);">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <i class="fa-solid ${utils.escHtml(s.icon || 'fa-pills')}" style="color: var(--primary);"></i>
                    <strong>${utils.escHtml(s.name_ar)}</strong>
                    ${s.name_en ? `<small style="color: var(--text-muted);">(${utils.escHtml(s.name_en)})</small>` : ""}
                    ${statusBadge}
                </div>
                <div style="display: flex; gap: 0.35rem;">${actionBtns}</div>
            </div>
        `;
    }).join("");

    container.innerHTML = `${addBtnHtml}${rowsHtml}`;
}

function openAddSubcategoryModal(categoryId) {
    document.getElementById("subcategoryForm").reset();
    document.getElementById("subcategoryIdInput").value = "";
    document.getElementById("subcategoryParentCategoryInput").value = categoryId;
    document.getElementById("subcategoryModalTitle").textContent = "إضافة فئة فرعية";
    document.getElementById("subcategoryModal").classList.add("active");
}

function openEditSubcategoryModal(categoryId, subcategoryId) {
    const list = subcategoriesCache[categoryId] || [];
    const s = list.find(item => item.id === subcategoryId);
    if (!s) return;

    document.getElementById("subcategoryIdInput").value = s.id;
    document.getElementById("subcategoryParentCategoryInput").value = categoryId;
    document.getElementById("subcategoryNameArInput").value = s.name_ar || "";
    document.getElementById("subcategoryNameEnInput").value = s.name_en || "";
    document.getElementById("subcategoryIconInput").value = s.icon || "";

    document.getElementById("subcategoryModalTitle").textContent = "تعديل الفئة الفرعية";
    document.getElementById("subcategoryModal").classList.add("active");
}

function closeSubcategoryModal() {
    document.getElementById("subcategoryModal").classList.remove("active");
}

async function handleSubcategoryFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById("subcategoryIdInput").value;
    const categoryId = document.getElementById("subcategoryParentCategoryInput").value;
    const nameAr = document.getElementById("subcategoryNameArInput").value.trim();
    const nameEn = document.getElementById("subcategoryNameEnInput").value.trim();
    const icon = document.getElementById("subcategoryIconInput").value.trim() || "fa-pills";

    if (!nameAr || !categoryId) {
        utils.showToast(i18n.currentLang === "ar" ? "يرجى كتابة اسم الفئة الفرعية" : "Please provide the subcategory name", "error");
        return;
    }

    const payload = {
        category_id: categoryId,
        name_ar: nameAr,
        name_en: nameEn,
        icon: icon
    };

    try {
        const client = db.getClient();
        if (id) {
            const { error } = await client.from("subcategories").update(payload).eq("id", id);
            if (error) throw error;
        } else {
            payload.is_active = true;
            const { error } = await client.from("subcategories").insert(payload);
            if (error) throw error;
        }

        utils.showToast(i18n.t("saveSuccess"), "success");
        closeSubcategoryModal();
        await loadSubcategoriesForCategory(categoryId);

    } catch (err) {
        console.error("Save subcategory error:", err);
        utils.showToast(i18n.t("errorGeneric"), "error");
    }
}

async function toggleSubcategoryActive(categoryId, subcategoryId, newStatus) {
    const actionText = newStatus ? i18n.t("activate") : i18n.t("deactivate");
    const confirmMsg = i18n.currentLang === "ar"
        ? `هل أنت متأكد من رغبتك في ${actionText} هذه الفئة الفرعية؟`
        : `Are you sure you want to ${actionText.toLowerCase()} this subcategory?`;

    utils.showConfirm(i18n.t("confirmDeleteTitle"), confirmMsg, async () => {
        try {
            const { error } = await db.getClient()
                .from("subcategories")
                .update({ is_active: newStatus })
                .eq("id", subcategoryId);

            if (error) throw error;

            utils.showToast(i18n.t("saveSuccess"), "success");
            await loadSubcategoriesForCategory(categoryId);
        } catch (err) {
            console.error("Toggle subcategory error:", err);
            utils.showToast(i18n.t("errorGeneric"), "error");
        }
    });
}

function openAddCategoryModal() {
    document.getElementById("categoryForm").reset();
    document.getElementById("categoryIdInput").value = "";
    document.getElementById("categoryModalTitle").textContent = i18n.t("addCategory");
    document.getElementById("categoryModal").classList.add("active");
}

function openEditCategoryModal(categoryId) {
    const cat = categoriesList.find(c => c.id === categoryId);
    if (!cat) return;

    document.getElementById("categoryIdInput").value = cat.id;
    document.getElementById("categoryNameArInput").value = cat.name_ar || "";
    document.getElementById("categoryNameEnInput").value = cat.name_en || "";
    document.getElementById("categorySlugInput").value = cat.slug || "";

    document.getElementById("categoryModalTitle").textContent = i18n.t("editCategory");
    document.getElementById("categoryModal").classList.add("active");
}

function closeCategoryModal() {
    document.getElementById("categoryModal").classList.remove("active");
}

async function handleCategoryFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById("categoryIdInput").value;
    const nameAr = document.getElementById("categoryNameArInput").value.trim();
    const nameEn = document.getElementById("categoryNameEnInput").value.trim();
    let slug = document.getElementById("categorySlugInput").value.trim();

    if (!nameAr) {
        utils.showToast(i18n.currentLang === "ar" ? "يرجى كتابة اسم القسم" : "Please provide category name", "error");
        return;
    }

    if (!slug) {
        slug = (nameEn || nameAr).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    }

    const payload = {
        name_ar: nameAr,
        name_en: nameEn,
        slug: slug
    };

    try {
        const client = db.getClient();
        if (id) {
            const { error } = await client.from("categories").update(payload).eq("id", id);
            if (error) throw error;
        } else {
            payload.is_active = true;
            const { error } = await client.from("categories").insert(payload);
            if (error) throw error;
        }

        utils.showToast(i18n.t("saveSuccess"), "success");
        closeCategoryModal();
        await loadCategories();

    } catch (err) {
        console.error("Save category error:", err);
        utils.showToast(i18n.t("errorGeneric"), "error");
    }
}

async function toggleCategoryActive(categoryId, newStatus) {
    const actionText = newStatus ? i18n.t("activate") : i18n.t("deactivate");
    const confirmMsg = i18n.currentLang === "ar"
        ? `هل أنت متأكد من رغبتك في ${actionText} هذا القسم؟`
        : `Are you sure you want to ${actionText.toLowerCase()} this category?`;

    utils.showConfirm(i18n.t("confirmDeleteTitle"), confirmMsg, async () => {
        try {
            const { error } = await db.getClient()
                .from("categories")
                .update({ is_active: newStatus })
                .eq("id", categoryId);

            if (error) throw error;

            utils.showToast(i18n.t("saveSuccess"), "success");
            await loadCategories();
        } catch (err) {
            console.error("Toggle category error:", err);
            utils.showToast(i18n.t("errorGeneric"), "error");
        }
    });
}
