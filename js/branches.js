// ==========================================================================
// صيدلية د.مصطفى فتحي حامد (Dr.Mostafa Fathy Hamed Pharmacy) - Branches Management Controller
// ==========================================================================

let branchesList = [];

const CITY_NAME_MAP = {
    cairo: "القاهرة",
    giza: "الجيزة",
    alexandria: "الإسكندرية",
    dakahlia: "الدقهلية",
    mansoura: "المنصورة"
};

function formatGovernorate(city) {
    if (!city) return "-";
    const lower = city.toLowerCase().trim();
    return CITY_NAME_MAP[lower] || city;
}

function handleGovernorateSelectChange(val) {
    const customInput = document.getElementById("branchCityCustomInput");
    if (!customInput) return;
    if (val === "other") {
        customInput.style.display = "block";
        customInput.required = true;
        customInput.focus();
    } else {
        customInput.style.display = "none";
        customInput.required = false;
        customInput.value = "";
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    utils.setupMobileSidebar();

    const isAuthed = await auth.init();
    if (!isAuthed) return;

    notifications.init();
    await loadBranches();

    window.onLanguageChange = () => renderBranchesTable();
});

async function loadBranches() {
    const tbody = document.getElementById("branchesTableBody");
    const emptyState = document.getElementById("emptyBranchesState");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 3rem;">${i18n.t("loadingData")}</td></tr>`;

    try {
        const client = db.getClient();
        const { data, error } = await client
            .from("branches")
            .select("*")
            .order("created_at", { ascending: true });

        if (error) throw error;

        branchesList = data || [];
        renderBranchesTable();

    } catch (err) {
        console.error("Load branches error:", err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #EF4444; padding: 2rem;">${i18n.t("errorGeneric")}</td></tr>`;
    }
}

function renderBranchesTable() {
    const tbody = document.getElementById("branchesTableBody");
    const emptyState = document.getElementById("emptyBranchesState");
    const countBadge = document.getElementById("branchesCountBadge");
    if (!tbody) return;

    if (countBadge) countBadge.textContent = `${branchesList.length} ${i18n.t("navBranches")}`;

    if (branchesList.length === 0) {
        tbody.innerHTML = "";
        if (emptyState) emptyState.style.display = "block";
        return;
    }

    if (emptyState) emptyState.style.display = "none";

    const canEdit = auth.isAdmin();

    tbody.innerHTML = branchesList.map(b => {
        const name = i18n.currentLang === "en" ? (b.name_en || b.name_ar) : b.name_ar;
        const statusBadge = b.is_active 
            ? `<span class="badge badge-active">${i18n.t("activate")}</span>`
            : `<span class="badge badge-inactive">${i18n.t("deactivate")}</span>`;

        const displayGov = formatGovernorate(b.city);
        const govBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.12); color: var(--primary); font-weight: 600; white-space: nowrap;"><i class="fa-solid fa-location-dot" style="margin-left: 4px;"></i>${utils.escHtml(displayGov)}</span>`;

        let actionBtns = "-";
        if (canEdit) {
            actionBtns = `
                <div style="display: flex; gap: 0.35rem;">
                    <button class="btn btn-secondary btn-sm" onclick="openEditBranchModal('${b.id}')" title="${i18n.t("edit")}">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="btn ${b.is_active ? 'btn-danger' : 'btn-primary'} btn-sm" onclick="toggleBranchActive('${b.id}', ${!b.is_active})" title="${b.is_active ? i18n.t("deactivate") : i18n.t("activate")}">
                        <i class="fa-solid ${b.is_active ? 'fa-eye-slash' : 'fa-eye'}"></i>
                    </button>
                </div>
            `;
        }

        return `
            <tr>
                <td><strong>${utils.escHtml(name)}</strong></td>
                <td>${govBadge}</td>
                <td><small style="color: var(--text-muted);">${utils.escHtml(b.address || "-")}</small></td>
                <td><a href="tel:${utils.escHtml(String(b.phone || "").replace(/[^+0-9]/g, ""))}" style="color: var(--primary); font-weight: 600;">${utils.escHtml(b.phone || "-")}</a></td>
                <td>${utils.escHtml(b.manager || "-")}</td>
                <td>${statusBadge}</td>
                <td>${actionBtns}</td>
            </tr>
        `;
    }).join("");
}

function openAddBranchModal() {
    document.getElementById("branchForm").reset();
    document.getElementById("branchIdInput").value = "";
    
    const citySelect = document.getElementById("branchCitySelect");
    if (citySelect) citySelect.value = "الدقهلية";
    const customInput = document.getElementById("branchCityCustomInput");
    if (customInput) {
        customInput.style.display = "none";
        customInput.value = "";
    }

    document.getElementById("branchModalTitle").textContent = i18n.t("addBranch");
    document.getElementById("branchModal").classList.add("active");
}

function openEditBranchModal(branchId) {
    const b = branchesList.find(item => item.id === branchId);
    if (!b) return;

    document.getElementById("branchIdInput").value = b.id;
    document.getElementById("branchNameArInput").value = b.name_ar || "";
    document.getElementById("branchNameEnInput").value = b.name_en || "";
    document.getElementById("branchAddressInput").value = b.address || "";
    document.getElementById("branchPhoneInput").value = b.phone || "";
    document.getElementById("branchManagerInput").value = b.manager || "";

    const citySelect = document.getElementById("branchCitySelect");
    const customInput = document.getElementById("branchCityCustomInput");
    const formattedCity = formatGovernorate(b.city || "");

    if (citySelect) {
        let matched = false;
        for (let i = 0; i < citySelect.options.length; i++) {
            const optVal = citySelect.options[i].value;
            if (optVal && (optVal === b.city || optVal === formattedCity)) {
                citySelect.value = optVal;
                matched = true;
                break;
            }
        }

        if (matched) {
            if (customInput) {
                customInput.style.display = "none";
                customInput.value = "";
            }
        } else if (b.city) {
            citySelect.value = "other";
            if (customInput) {
                customInput.style.display = "block";
                customInput.value = b.city;
            }
        } else {
            citySelect.value = "الدقهلية";
            if (customInput) {
                customInput.style.display = "none";
                customInput.value = "";
            }
        }
    }

    document.getElementById("branchModalTitle").textContent = i18n.t("editBranch");
    document.getElementById("branchModal").classList.add("active");
}

function closeBranchModal() {
    document.getElementById("branchModal").classList.remove("active");
}

async function handleBranchFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById("branchIdInput").value;
    const nameAr = document.getElementById("branchNameArInput").value.trim();
    const nameEn = document.getElementById("branchNameEnInput").value.trim();
    const address = document.getElementById("branchAddressInput").value.trim();
    const phone = document.getElementById("branchPhoneInput").value.trim();
    const manager = document.getElementById("branchManagerInput").value.trim();

    const citySelect = document.getElementById("branchCitySelect");
    const customInput = document.getElementById("branchCityCustomInput");
    let city = citySelect ? citySelect.value : "";
    if (city === "other") {
        city = customInput ? customInput.value.trim() : "";
    }

    if (!nameAr || !address || !city) {
        utils.showToast(i18n.currentLang === "ar" ? "يرجى إدخال اسم الفرع والمحافظة والعنوان" : "Please provide branch name, governorate and address", "error");
        return;
    }

    const payload = {
        name_ar: nameAr,
        name_en: nameEn,
        city: city,
        address: address,
        phone: phone,
        manager: manager
    };

    try {
        const client = db.getClient();
        if (id) {
            const { error } = await client.from("branches").update(payload).eq("id", id);
            if (error) throw error;
        } else {
            payload.is_active = true;
            const { error } = await client.from("branches").insert(payload);
            if (error) throw error;
        }

        utils.showToast(i18n.t("saveSuccess"), "success");
        closeBranchModal();
        await loadBranches();

    } catch (err) {
        console.error("Save branch error:", err);
        utils.showToast(i18n.t("errorGeneric"), "error");
    }
}

async function toggleBranchActive(branchId, newStatus) {
    const actionText = newStatus ? i18n.t("activate") : i18n.t("deactivate");
    const confirmMsg = i18n.currentLang === "ar"
        ? `هل أنت متأكد من رغبتك في ${actionText} هذا الفرع؟`
        : `Are you sure you want to ${actionText.toLowerCase()} this branch?`;

    utils.showConfirm(i18n.t("confirmDeleteTitle"), confirmMsg, async () => {
        try {
            const { error } = await db.getClient()
                .from("branches")
                .update({ is_active: newStatus })
                .eq("id", branchId);

            if (error) throw error;

            utils.showToast(i18n.t("saveSuccess"), "success");
            await loadBranches();
        } catch (err) {
            console.error("Toggle branch error:", err);
            utils.showToast(i18n.t("errorGeneric"), "error");
        }
    });
}
