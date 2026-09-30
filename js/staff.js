// ==========================================================================
// صيدلية د.مصطفى فتحي حامد (Dr.Mostafa Fathy Hamed Pharmacy) - Staff & Pharmacists Controller
// ==========================================================================

let staffList = [];
let branchesList = [];

document.addEventListener("DOMContentLoaded", async () => {
    utils.setupMobileSidebar();

    const isAuthed = await auth.init();
    if (!isAuthed) return;

    if (!auth.isAdmin()) {
        window.location.href = "orders.html";
        return;
    }

    notifications.init();
    await loadBranchesDropdown();
    await loadStaff();

    window.onLanguageChange = () => {
        renderStaffTable();
        loadBranchesDropdown();
    };
});

async function loadBranchesDropdown() {
    try {
        const { data } = await db.getClient().from("branches").select("id, name_ar, name_en").eq("is_active", true);
        branchesList = data || [];
        const select = document.getElementById("staffBranchSelect");
        if (select) {
            select.innerHTML = `<option value="">${i18n.currentLang === "ar" ? "-- بدون فرع محدد (إدارة عامة) --" : "-- No Specific Branch --"}</option>` +
                branchesList.map(b => `<option value="${utils.escHtml(b.id)}">${utils.escHtml(i18n.currentLang === "en" ? (b.name_en || b.name_ar) : b.name_ar)}</option>`).join("");
        }
    } catch (e) {
        console.error("Staff branches dropdown error:", e);
    }
}

async function loadStaff() {
    const tbody = document.getElementById("staffTableBody");
    const emptyState = document.getElementById("emptyStaffState");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 3rem;">${i18n.t("loadingData")}</td></tr>`;

    try {
        const client = db.getClient();
        const { data, error } = await client
            .from("profiles")
            .select("*, branches(name_ar, name_en)")
            .order("created_at", { ascending: true });

        if (error) throw error;

        staffList = data || [];
        renderStaffTable();

    } catch (err) {
        console.error("Load staff error:", err);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #EF4444; padding: 2rem;">${i18n.t("errorGeneric")}</td></tr>`;
    }
}

function renderStaffTable() {
    const tbody = document.getElementById("staffTableBody");
    const emptyState = document.getElementById("emptyStaffState");
    const countBadge = document.getElementById("staffCountBadge");
    if (!tbody) return;

    if (countBadge) countBadge.textContent = `${staffList.length} ${i18n.t("navStaff")}`;

    if (staffList.length === 0) {
        tbody.innerHTML = "";
        if (emptyState) emptyState.style.display = "block";
        return;
    }

    if (emptyState) emptyState.style.display = "none";

    tbody.innerHTML = staffList.map(s => {
        const roleBadge = s.role === "admin" 
            ? `<span class="badge badge-confirmed"><i class="fa-solid fa-user-shield"></i> ${i18n.t("roleAdmin")}</span>`
            : `<span class="badge badge-delivery"><i class="fa-solid fa-user-doctor"></i> ${i18n.t("rolePharmacist")}</span>`;

        const branchName = s.branches 
            ? (i18n.currentLang === "en" ? (s.branches.name_en || s.branches.name_ar) : s.branches.name_ar)
            : (s.role === "admin" ? i18n.t("branchAll") : "-");

        const statusBadge = s.is_active 
            ? `<span class="badge badge-active">${i18n.t("activate")}</span>`
            : `<span class="badge badge-inactive">${i18n.t("deactivate")}</span>`;

        const isSelf = auth.user?.id === s.id;

        const actionBtns = `
            <div style="display: flex; gap: 0.35rem;">
                <button class="btn btn-secondary btn-sm" onclick="openEditStaffModal('${s.id}')" title="${i18n.t("edit")}">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                ${!isSelf ? `
                    <button class="btn ${s.is_active ? 'btn-danger' : 'btn-primary'} btn-sm" onclick="toggleStaffActive('${s.id}', ${!s.is_active})" title="${s.is_active ? i18n.t("deactivate") : i18n.t("activate")}">
                        <i class="fa-solid ${s.is_active ? 'fa-user-slash' : 'fa-user-check'}"></i>
                    </button>
                ` : ""}
            </div>
        `;

        return `
            <tr>
                <td>
                    <div style="font-weight: 600;">${utils.escHtml(s.full_name)}</div>
                </td>
                <td><a href="tel:${utils.escHtml(String(s.mobile || "").replace(/[^+0-9]/g, ""))}" style="color: var(--primary); font-weight: 600;">${utils.escHtml(s.mobile || "-")}</a></td>
                <td>${roleBadge}</td>
                <td><small style="color: var(--text-muted); font-weight: 600;">${utils.escHtml(branchName)}</small></td>
                <td>${statusBadge}</td>
                <td>${actionBtns}</td>
            </tr>
        `;
    }).join("");
}

function openEditStaffModal(staffId) {
    const s = staffList.find(item => item.id === staffId);
    if (!s) return;

    document.getElementById("staffIdInput").value = s.id;
    document.getElementById("staffNameInput").value = s.full_name || "";
    document.getElementById("staffMobileInput").value = s.mobile || "";
    document.getElementById("staffRoleSelect").value = s.role || "pharmacist";
    document.getElementById("staffBranchSelect").value = s.branch_id || "";

    document.getElementById("staffModalTitle").textContent = i18n.t("editStaff");
    document.getElementById("staffModal").classList.add("active");
}

function closeStaffModal() {
    document.getElementById("staffModal").classList.remove("active");
}

async function handleStaffFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById("staffIdInput").value;
    const name = document.getElementById("staffNameInput").value.trim();
    const mobile = document.getElementById("staffMobileInput").value.trim();
    const role = document.getElementById("staffRoleSelect").value;
    const branchId = document.getElementById("staffBranchSelect").value || null;

    if (!name) {
        utils.showToast(i18n.currentLang === "ar" ? "يرجى كتابة الاسم" : "Please provide name", "error");
        return;
    }

    const payload = {
        full_name: name,
        mobile: mobile,
        role: role,
        branch_id: branchId
    };

    try {
        const { error } = await db.getClient()
            .from("profiles")
            .update(payload)
            .eq("id", id);

        if (error) throw error;

        utils.showToast(i18n.t("saveSuccess"), "success");
        closeStaffModal();
        await loadStaff();

    } catch (err) {
        console.error("Save staff error:", err);
        utils.showToast(i18n.t("errorGeneric"), "error");
    }
}

async function toggleStaffActive(staffId, newStatus) {
    const actionText = newStatus ? i18n.t("activate") : i18n.t("deactivate");
    const confirmMsg = i18n.currentLang === "ar"
        ? `هل أنت متأكد من ${actionText} هذا الحساب؟`
        : `Are you sure you want to ${actionText.toLowerCase()} this account?`;

    utils.showConfirm(i18n.t("confirmDeleteTitle"), confirmMsg, async () => {
        try {
            const { error } = await db.getClient()
                .from("profiles")
                .update({ is_active: newStatus })
                .eq("id", staffId);

            if (error) throw error;

            utils.showToast(i18n.t("saveSuccess"), "success");
            await loadStaff();
        } catch (err) {
            console.error("Toggle staff error:", err);
            utils.showToast(i18n.t("errorGeneric"), "error");
        }
    });
}
