// ==========================================================================
// صيدلية د.مصطفى فتحي حامد (Dr.Mostafa Fathy Hamed Pharmacy) - Consultations Queue Controller
// ==========================================================================

let consultsState = {
    searchQuery: "",
    statusFilter: "all",
    contactFilter: "all",
    page: 1,
    pageSize: 15,
    totalCount: 0
};

document.addEventListener("DOMContentLoaded", async () => {
    utils.setupMobileSidebar();

    const isAuthed = await auth.init();
    if (!isAuthed) return;

    notifications.init();
    setupConsultationListeners();
    initializeConsultationPrintDates();
    await loadConsultations();

    window.onNewRealtimeConsultation = () => loadConsultations();
    window.onRealtimeConsultationUpdate = () => loadConsultations();
    window.onLanguageChange = () => loadConsultations();

    // Called by notifications.js when a pending consultation alert is cleared
    // from another tab/page so the mute button disappears.
    window._refreshConsultMuteButtons = () => {
        document.querySelectorAll(".mute-consult-btn").forEach(btn => {
            const consultId = btn.dataset.consultId;
            if (!notifications.isConsultPending(consultId)) {
                btn.style.display = "none";
            }
        });
    };
});

function initializeConsultationPrintDates() {
    const today = new Date();
    const from = document.getElementById("consultationsPrintFrom");
    const to = document.getElementById("consultationsPrintTo");
    if (from) from.value = `${today.getFullYear()}-01-01`;
    if (to) to.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

async function exportConsultationsByDateRange() {
    const button = document.getElementById("exportConsultationsBtn");
    try {
        if (typeof XLSX === "undefined") throw new Error(i18n.currentLang === "en" ? "Excel export is unavailable. Reload the page and try again." : "ميزة Excel غير متاحة الآن. أعد تحميل الصفحة وحاول مرة أخرى.");
        const fromValue = document.getElementById("consultationsPrintFrom")?.value;
        const toValue = document.getElementById("consultationsPrintTo")?.value;
        if (!fromValue || !toValue || fromValue > toValue) {
            throw new Error(i18n.currentLang === "en" ? "Choose a valid start and end date." : "اختر تاريخ بداية ونهاية صحيحين.");
        }
        const [fy, fm, fd] = fromValue.split("-").map(Number);
        const [ty, tm, td] = toValue.split("-").map(Number);
        const from = new Date(fy, fm - 1, fd).toISOString();
        const toExclusive = new Date(ty, tm - 1, td + 1).toISOString();
        if (button) button.disabled = true;

        const consultations = [];
        for (let offset = 0; ; offset += 500) {
            const { data, error } = await db.getClient().from("consultations")
                .select("id, patient_name, phone, consultation_type, contact_method, status, created_at, preferred_time, details, outcome, outcome_notes, branch_id, followed_up_by, followed_up_at, updated_at, branches(name_ar, name_en)")
                .gte("created_at", from).lt("created_at", toExclusive)
                .order("created_at", { ascending: false }).range(offset, offset + 499);
            if (error) throw error;
            const batch = data || [];
            consultations.push(...batch);
            if (batch.length < 500) break;
        }

        const headers = i18n.currentLang === "en"
            ? ["ID", "Consultant", "Phone", "Consultation type", "Contact method", "Status", "Branch", "Preferred time", "Details", "Outcome", "Outcome notes", "Followed up by", "Followed up at", "Created at", "Updated at"]
            : ["المعرف", "المستشير", "الهاتف", "نوع الاستشارة", "وسيلة التواصل", "الحالة", "الفرع", "الوقت المفضل", "التفاصيل", "النتيجة", "ملاحظات النتيجة", "تمت المتابعة بواسطة", "وقت المتابعة", "تاريخ الإنشاء", "آخر تحديث"];
        const rows = consultations.map(consult => [consult.id, consult.patient_name || "", consult.phone || "", utils.translateConsultType(consult.consultation_type), consult.contact_method || "", consult.status || "", i18n.currentLang === "en" ? (consult.branches?.name_en || consult.branches?.name_ar || "") : (consult.branches?.name_ar || ""), consult.preferred_time || "", consult.details || "", consult.outcome || "", consult.outcome_notes || "", consult.followed_up_by || "", consult.followed_up_at || "", consult.created_at || "", consult.updated_at || ""]);
        const workbook = XLSX.utils.book_new();
        const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        sheet["!cols"] = headers.map((_, index) => ({ wch: index >= 7 && index <= 10 ? 32 : 20 }));
        XLSX.utils.book_append_sheet(workbook, sheet, i18n.currentLang === "en" ? "Consultations" : "الاستشارات");
        XLSX.writeFile(workbook, `pharmacy-consultations_${fromValue}_${toValue}.xlsx`);
        utils.showToast(i18n.currentLang === "en" ? `Downloaded ${consultations.length} consultations.` : `تم تنزيل ${consultations.length} استشارة.`, "success");
    } catch (error) {
        utils.showToast(error.message || i18n.t("errorGeneric"), "error");
    } finally {
        if (button) button.disabled = false;
    }
}

function setupConsultationListeners() {
    const searchInput = document.getElementById("consultationSearchInput");
    const statusSelect = document.getElementById("consultStatusFilter");
    const contactSelect = document.getElementById("consultContactFilter");

    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener("input", (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                consultsState.searchQuery = e.target.value.trim();
                consultsState.page = 1;
                loadConsultations();
            }, 300);
        });
    }

    if (statusSelect) {
        statusSelect.addEventListener("change", (e) => {
            consultsState.statusFilter = e.target.value;
            consultsState.page = 1;
            loadConsultations();
        });
    }

    if (contactSelect) {
        contactSelect.addEventListener("change", (e) => {
            consultsState.contactFilter = e.target.value;
            consultsState.page = 1;
            loadConsultations();
        });
    }
}

function getConsultStatusBadge(status) {
    const s = (status || "new").toLowerCase();
    const map = {
        new: { icon: "fa-sparkles", key: "statusNew", cls: "badge-new" },
        contacted: { icon: "fa-phone", key: "statusContacted", cls: "badge-warning" },
        completed: { icon: "fa-badge-check", key: "statusCompleted", cls: "badge-completed" },
        no_response: { icon: "fa-hourglass-end", key: "statusNoResponse", cls: "badge-cancelled" }
    };
    const cfg = map[s] || map.new;
    return `<span class="badge ${cfg.cls}"><i class="fa-solid ${cfg.icon}"></i> ${i18n.t(cfg.key)}</span>`;
}

/**
 * Pill badge (same look as the status badge) showing which branch took over /
 * changed the status of this consultation. "-" while nobody has touched it.
 * The full branch name is kept in the tooltip; the pill shows the short
 * part before the first " - " (e.g. "فرع طناح").
 */
function getConsultBranchBadge(consult) {
    const b = consult && consult.branches;
    if (!b) return `<span style="color: var(--text-subtle);">-</span>`;

    const ar = i18n.currentLang !== "en";
    const fullName = ar ? b.name_ar : (b.name_en || b.name_ar);
    const shortName = String(fullName || "").split(" - ")[0];
    const tip = (ar ? "تم تغيير حالة الاستشارة بواسطة " : "Status changed by ") + String(fullName || "");
    const safeTitle = utils.escHtml(tip);

    return `<span class="badge badge-delivery" title="${safeTitle}"><i class="fa-solid fa-store"></i> ${utils.escHtml(shortName)}</span>`;
}

/**
 * Who may change the status of a consultation?
 *  - admin: always.
 *  - pharmacist: only if the consultation is unclaimed (his branch will then
 *    claim it) or already claimed by HIS branch. Once another branch changed
 *    the status, it is locked for everybody else.
 * (The database enforces the same rule through RLS — see
 *  consultations_branch_lock.sql — this just drives the UI.)
 */
function getConsultLockInfo(consult) {
    if (auth.isAdmin()) return { locked: false, willClaim: false };

    const myBranchId = auth.getUserBranchId();
    if (!myBranchId) return { locked: true, reason: "noBranch" };
    if (!consult.branch_id) return { locked: false, willClaim: true };
    if (consult.branch_id === myBranchId) return { locked: false, willClaim: false };
    return { locked: true, reason: "otherBranch" };
}

function getContactMethodBadge(method) {
    const isPhone = (method || "").toLowerCase() !== "whatsapp";
    if (isPhone) {
        return `<span class="badge badge-confirmed"><i class="fa-solid fa-phone"></i> ${i18n.t("contactPhone")}</span>`;
    }
    return `<span class="badge badge-success"><i class="fa-brands fa-whatsapp"></i> ${i18n.t("contactWhatsapp")}</span>`;
}

async function loadConsultations() {
    const tableBody = document.getElementById("consultationsTableBody");
    const emptyState = document.getElementById("emptyConsultationsState");
    const paginationEl = document.getElementById("consultationsPagination");
    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 3rem;">${i18n.t("loadingData")}</td></tr>`;

    try {
        const client = db.getClient();
        let query = client
            .from("consultations")
            .select("id, patient_name, phone, consultation_type, preferred_time, contact_method, details, status, created_at, outcome, outcome_notes, branch_id, branches(name_ar, name_en)", { count: "exact" });

        // Every branch sees all consultations; the ones claimed by another
        // branch are read-only for it (see getConsultLockInfo / RLS).

        if (consultsState.searchQuery) {
            const sq = consultsState.searchQuery.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
            query = query.or(`patient_name.ilike."%${sq}%",phone.ilike."%${sq}%"`);
        }

        if (consultsState.statusFilter && consultsState.statusFilter !== "all") {
            query = query.eq("status", consultsState.statusFilter);
        }

        if (consultsState.contactFilter && consultsState.contactFilter !== "all") {
            query = query.eq("contact_method", consultsState.contactFilter);
        }

        const from = (consultsState.page - 1) * consultsState.pageSize;
        const to = from + consultsState.pageSize - 1;

        query = query.order("created_at", { ascending: false }).range(from, to);

        const { data, error, count } = await query;
        if (error) throw error;

        consultsState.totalCount = count || 0;

        const countBadge = document.getElementById("consultationsCountBadge");
        if (countBadge) countBadge.textContent = `${consultsState.totalCount} ${i18n.t("consultPatient")}`;

        if (!data || data.length === 0) {
            tableBody.innerHTML = "";
            if (emptyState) emptyState.style.display = "block";
            if (paginationEl) paginationEl.innerHTML = "";
            return;
        }

        if (emptyState) emptyState.style.display = "none";

        tableBody.innerHTML = data.map(c => {
            const patient = utils.escHtml(c.patient_name || "-");
            const phone = utils.escHtml(c.phone || "-");
            const statusBadge = getConsultStatusBadge(c.status);
            const contactBadge = getContactMethodBadge(c.contact_method);
            const dateStr = utils.formatDate(c.created_at, true);

            const isNew = (c.status || "").toLowerCase() === "new";
            const isPending = notifications.isConsultPending(c.id);
            const muteBtn = (isNew && isPending)
                ? `<button
                        class="btn btn-warning btn-sm mute-consult-btn"
                        data-consult-id="${c.id}"
                        onclick="muteConsultationAlert('${c.id}', this)"
                        title="${i18n.currentLang === 'ar' ? 'كتم تنبيه هذه الاستشارة' : 'Mute alert for this consultation'}"
                        style="display:flex;align-items:center;gap:0.3rem;">
                        <i class="fa-solid fa-bell-slash"></i>
                        <span>${i18n.currentLang === 'ar' ? 'كتم التنبيه' : 'Mute Alert'}</span>
                   </button>`
                : "";

            return `
                <tr ${isNew && isPending ? 'style="background: rgba(34,211,238,0.06);"' : ''}>
                    <td><strong>${patient}</strong></td>
                    <td><a href="tel:${phone}" style="color: var(--primary); font-weight: 600;"><i class="fa-solid fa-phone"></i> ${phone}</a></td>
                    <td>${utils.escHtml(utils.translateConsultType(c.consultation_type))}</td>
                    <td>${contactBadge}</td>
                    <td>${statusBadge}</td>
                    <td>${getConsultBranchBadge(c)}</td>
                    <td><small style="color: var(--text-muted);">${dateStr}</small></td>
                    <td>
                        <div style="display:flex; gap:0.4rem; align-items:center; flex-wrap:wrap;">
                            <button class="btn btn-outline btn-sm" onclick="openConsultationDetails('${c.id}')">
                                <i class="fa-solid fa-eye"></i> ${i18n.t("actionViewDetails")}
                            </button>
                            ${muteBtn}
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

        renderConsultationPagination(paginationEl);

    } catch (err) {
        console.error("Load consultations error:", err);
        tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #EF4444; padding: 2rem;">${i18n.t("errorGeneric")}</td></tr>`;
    }
}

function renderConsultationPagination(container) {
    if (!container) return;

    const totalPages = Math.ceil(consultsState.totalCount / consultsState.pageSize) || 1;
    if (totalPages <= 1) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 1rem;">
            <span style="font-size: 0.85rem; color: var(--text-muted);">
                ${i18n.currentLang === "ar"
                    ? `عرض صفحة ${consultsState.page} من ${totalPages} (إجمالي ${consultsState.totalCount} استشارة)`
                    : `Showing page ${consultsState.page} of ${totalPages} (Total ${consultsState.totalCount} consultations)`}
            </span>
            <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-secondary btn-sm" ${consultsState.page <= 1 ? "disabled" : ""} onclick="changeConsultationsPage(${consultsState.page - 1})">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
                <button class="btn btn-secondary btn-sm" ${consultsState.page >= totalPages ? "disabled" : ""} onclick="changeConsultationsPage(${consultsState.page + 1})">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
            </div>
        </div>
    `;
}

function changeConsultationsPage(newPage) {
    consultsState.page = newPage;
    loadConsultations();
}

function muteConsultationAlert(consultId, btn) {
    notifications.removeConsultPendingAlert(String(consultId));

    if (btn) {
        btn.style.opacity = "0";
        btn.style.transform = "scale(0.8)";
        btn.style.transition = "all 0.25s ease";
        setTimeout(() => { btn.style.display = "none"; }, 260);
    }

    const row = btn?.closest("tr");
    if (row) row.style.background = "";

    const label = i18n.currentLang === "ar"
        ? "تم كتم تنبيه الاستشارة"
        : "Alert muted for this consultation";
    utils.showToast(label, "info");
}

// ------------------------------------------------------------------
// Consultation Details Modal (view full info + update status)
// ------------------------------------------------------------------
async function openConsultationDetails(id) {
    try {
        const { data, error } = await db.getClient()
            .from("consultations")
            .select("*, branches(name_ar, name_en)")
            .eq("id", id)
            .maybeSingle();

        if (error || !data) {
            utils.showToast(i18n.t("errorGeneric"), "error");
            return;
        }

        let modal = document.getElementById("consultDetailsModal");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "consultDetailsModal";
            modal.className = "modal-backdrop";
            modal.innerHTML = `
                <div class="modal-card" style="max-width: 600px;">
                    <div class="modal-header">
                        <h4 class="card-title" id="consultModalTitle"></h4>
                        <button class="btn btn-icon btn-sm" onclick="closeConsultModal()"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <div class="modal-body" id="consultModalBody"></div>
                    <div class="modal-footer" id="consultModalFooter"></div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        document.getElementById("consultModalTitle").textContent = `${data.patient_name} (${data.phone})`;
        const contactLabel = data.contact_method === "whatsapp" ? i18n.t("contactWhatsapp") : i18n.t("contactPhone");
        document.getElementById("consultModalBody").innerHTML = `
            <div style="display:grid;gap:0.75rem;">
                <p style="margin:0;"><strong>${i18n.t("consultType")}:</strong> ${utils.escHtml(utils.translateConsultType(data.consultation_type))}</p>
                <p style="margin:0;"><strong>${i18n.t("consultContactMethod")}:</strong> ${contactLabel}</p>
                <p style="margin:0;"><strong>${i18n.t("consultPreferredTime")}:</strong> ${utils.escHtml(data.preferred_time || "-")}</p>
                <p style="margin:0;"><strong>${i18n.t("consultStatus")}:</strong> ${getConsultStatusBadge(data.status)}</p>
                <p style="margin:0;"><strong>${i18n.t("filterBranch")}:</strong> ${getConsultBranchBadge(data)}</p>
                <p style="margin:0;"><strong>${i18n.t("consultDate")}:</strong> ${utils.formatDate(data.created_at, true)}</p>
                <hr style="border:none;border-top:1px solid var(--border-color);">
                <p style="margin:0;"><strong>${i18n.t("consultDetails")}:</strong></p>
                <p style="margin:0; background: var(--bg-surface-subtle); padding: 0.75rem; border-radius: var(--radius-md); white-space: pre-wrap;">${utils.escHtml(data.details || "-")}</p>
            </div>
        `;

        const currentStatus = (data.status || "new").toLowerCase();
        const current = (val) => val === currentStatus ? "selected" : "";

        const ar = i18n.currentLang !== "en";
        const lock = getConsultLockInfo(data);
        let footerHtml;

        if (lock.locked) {
            const branchName = data.branches
                ? (ar ? data.branches.name_ar : (data.branches.name_en || data.branches.name_ar))
                : "";
            const lockMsg = lock.reason === "noBranch"
                ? (ar ? "حسابك غير مرتبط بفرع، لذلك لا يمكنك تغيير حالة الاستشارات. برجاء مراجعة الإدارة."
                      : "Your account is not linked to a branch, so you cannot change consultation statuses.")
                : (ar ? `تم تغيير حالة هذه الاستشارة بواسطة ${branchName}، ولا يمكن لباقي الفروع تعديلها.`
                      : `The status of this consultation was changed by ${branchName}; other branches cannot edit it.`);

            footerHtml = `
                <div style="display:flex;align-items:center;gap:0.6rem;width:100%;color:var(--text-muted);font-size:0.88rem;">
                    <i class="fa-solid fa-lock" style="color:#DC2626;"></i>
                    <span>${utils.escHtml(lockMsg)}</span>
                </div>
            `;
        } else {
            const myBranchName = auth.branch
                ? (ar ? auth.branch.name_ar : (auth.branch.name_en || auth.branch.name_ar))
                : (ar ? "فرعك" : "your branch");
            const claimHint = lock.willClaim
                ? `<div style="width:100%;font-size:0.82rem;color:var(--text-muted);">
                        <i class="fa-solid fa-circle-info"></i>
                        ${utils.escHtml(ar ? `عند تغيير الحالة سيتم ربط الاستشارة بفرعك (${myBranchName}) ولن يُسمح لباقي الفروع بتغييرها.`
                             : `Changing the status links this consultation to your branch (${myBranchName}); other branches will not be able to change it.`)}
                   </div>`
                : "";

            footerHtml = `
                <div style="display:flex;flex-direction:column;gap:0.6rem;width:100%;">
                    ${claimHint}
                    <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;width:100%;">
                        <select id="consultStatusSelect" class="form-control" style="flex:1;min-width:150px;">
                            <option value="new" ${current("new")}>${i18n.t("statusNew")}</option>
                            <option value="contacted" ${current("contacted")}>${i18n.t("statusContacted")}</option>
                            <option value="completed" ${current("completed")}>${i18n.t("statusCompleted")}</option>
                            <option value="no_response" ${current("no_response")}>${i18n.t("statusNoResponse")}</option>
                        </select>
                        <button class="btn btn-primary" onclick="updateConsultationStatus('${data.id}', this)">
                            <i class="fa-solid fa-check"></i> <span>${i18n.t("save")}</span>
                        </button>
                    </div>
                </div>
            `;
        }

        document.getElementById("consultModalFooter").innerHTML = footerHtml;

        modal.classList.add("active");
    } catch (err) {
        console.error("Open consultation details error:", err);
        utils.showToast(i18n.t("errorGeneric"), "error");
    }
}

function closeConsultModal() {
    const modal = document.getElementById("consultDetailsModal");
    if (modal) modal.classList.remove("active");
}

async function updateConsultationStatus(id, btn) {
    const select = document.getElementById("consultStatusSelect");
    if (!select) return;

    // A pharmacist must belong to a branch, otherwise nobody could be credited
    // with (and locked to) the consultation.
    if (auth.isPharmacist() && !auth.getUserBranchId()) {
        utils.showToast(
            i18n.currentLang === "ar"
                ? "حسابك غير مرتبط بفرع، لا يمكنك تغيير حالة الاستشارة"
                : "Your account is not linked to a branch",
            "error"
        );
        return;
    }

    const newStatus = select.value;
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';

    try {
        const payload = { status: newStatus, updated_at: new Date().toISOString() };

        // Whoever changes the status "claims" the consultation for his branch:
        // from now on it is linked to that branch and locked for the others (RLS).
        const myBranchId = auth.getUserBranchId();
        if (auth.isPharmacist() && myBranchId) {
            payload.branch_id = myBranchId;
        }

        const { data: updatedRows, error } = await db.getClient()
            .from("consultations")
            .update(payload)
            .eq("id", id)
            .select("id");

        if (error) throw error;

        // 0 rows updated = another branch claimed it a moment ago
        if (!updatedRows || updatedRows.length === 0) {
            utils.showToast(
                i18n.currentLang === "ar"
                    ? "تم استلام هذه الاستشارة بواسطة فرع آخر"
                    : "This consultation was already taken by another branch",
                "error"
            );
            notifications.removeConsultPendingAlert(String(id));
            closeConsultModal();
            loadConsultations();
            return;
        }

        // Clearing the alert if it leaves "new"
        if (newStatus !== "new") {
            notifications.removeConsultPendingAlert(String(id));
        } else {
            notifications.addConsultPendingAlert(String(id));
        }

        utils.showToast(i18n.t("consultStatusUpdateSuccess") || "تم تحديث حالة الاستشارة بنجاح", "success");
        closeConsultModal();
        loadConsultations();
    } catch (err) {
        console.error("Update consultation status error:", err);
        utils.showToast(i18n.t("errorGeneric"), "error");
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
}
