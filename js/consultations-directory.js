// ==========================================================================
// صيدلية د.مصطفى فتحي حامد (Dr.Mostafa Fathy Hamed Pharmacy) - Consultations Follow-up Directory
// ==========================================================================

let directoryList = [];
let filteredDirectory = [];

let directoryState = {
    searchQuery: "",
    periodFilter: "all",
    customStart: null,
    customEnd: null,
    typeFilter: "all"
};

document.addEventListener("DOMContentLoaded", async () => {
    utils.setupMobileSidebar();

    const isAuthed = await auth.init();
    if (!isAuthed) return;

    notifications.init();
    setupDirectoryListeners();
    await loadDirectory();

    window.onLanguageChange = () => {
        populateTypeFilter();
        renderDirectoryTable();
    };
    window.onRealtimeConsultationUpdate = () => loadDirectory();
});

function setupDirectoryListeners() {
    const searchInput = document.getElementById("directorySearchInput");
    const periodSelect = document.getElementById("directoryPeriodFilter");
    const typeSelect = document.getElementById("directoryTypeFilter");
    const customDateWrap = document.getElementById("directoryCustomDateWrap");

    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener("input", (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                directoryState.searchQuery = e.target.value.trim();
                applyDirectoryFilters();
            }, 250);
        });
    }

    if (periodSelect) {
        periodSelect.addEventListener("change", (e) => {
            directoryState.periodFilter = e.target.value;
            if (e.target.value === "custom") {
                if (customDateWrap) customDateWrap.style.display = "flex";
                applyDirectoryFilters();
            } else {
                if (customDateWrap) customDateWrap.style.display = "none";
                applyDirectoryFilters();
            }
        });
    }

    if (typeSelect) {
        typeSelect.addEventListener("change", (e) => {
            directoryState.typeFilter = e.target.value;
            applyDirectoryFilters();
        });
    }
}

function applyDirectoryDateFilter() {
    const start = document.getElementById("directoryCustomStart")?.value;
    const end = document.getElementById("directoryCustomEnd")?.value;
    directoryState.customStart = start ? new Date(start).toISOString() : null;
    directoryState.customEnd = end ? new Date(`${end}T23:59:59.999Z`).toISOString() : null;
    applyDirectoryFilters();
}

/**
 * Applies search + follow-up period + consultation type filters (client-side)
 * over the loaded directory list and re-renders.
 */
function applyDirectoryFilters() {
    let filtered = [...directoryList];

    if (directoryState.searchQuery) {
        const q = directoryState.searchQuery.toLowerCase();
        filtered = filtered.filter(c =>
            (c.patient_name || "").toLowerCase().includes(q) ||
            (c.phone || "").includes(q)
        );
    }

    if (directoryState.typeFilter && directoryState.typeFilter !== "all") {
        filtered = filtered.filter(c => (c.consultation_type || "") === directoryState.typeFilter);
    }

    // Follow-up date period filtering (based on followed_up_at)
    const now = new Date();
    filtered = filtered.filter(c => {
        const followUp = c.followed_up_at ? new Date(c.followed_up_at) : null;
        switch (directoryState.periodFilter) {
            case "today": {
                const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                return followUp && followUp >= startToday;
            }
            case "yesterday": {
                const yStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
                const yEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                return followUp && followUp >= yStart && followUp < yEnd;
            }
            case "week": {
                const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
                weekStart.setHours(0, 0, 0, 0);
                return followUp && followUp >= weekStart;
            }
            case "month": {
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                return followUp && followUp >= monthStart;
            }
            case "custom":
                if (!directoryState.customStart && !directoryState.customEnd) return true;
                if (directoryState.customStart && (!followUp || followUp < new Date(directoryState.customStart))) return false;
                if (directoryState.customEnd && (!followUp || followUp > new Date(directoryState.customEnd))) return false;
                return true;
            default:
                return true;
        }
    });

    filteredDirectory = filtered;
    renderDirectoryTable();
}

async function loadDirectory() {
    const tbody = document.getElementById("directoryTableBody");
    const emptyState = document.getElementById("emptyDirectoryState");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 3rem;">${i18n.t("loadingData")}</td></tr>`;

    try {
        let query = db.getClient()
            .from("consultations")
            .select("id, patient_name, phone, consultation_type, contact_method, details, status, created_at, outcome, outcome_notes, followed_up_by, followed_up_at, branch_id")
            .order("created_at", { ascending: false });

        const { data, error } = await query;

        if (error) throw error;

        directoryList = data || [];
        populateTypeFilter();
        applyDirectoryFilters();
    } catch (err) {
        console.error("Load consultations directory error:", err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #EF4444; padding: 2rem;">${i18n.t("errorGeneric")}</td></tr>`;
    }
}

/**
 * Fills the consultation type filter dropdown with the distinct types
 * present in the directory data, preserving the current selection.
 */
function populateTypeFilter() {
    const typeSelect = document.getElementById("directoryTypeFilter");
    if (!typeSelect) return;

    const selected = directoryState.typeFilter;
    const types = [...new Set(
        directoryList.map(c => (c.consultation_type || "").trim()).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, "ar"));

    typeSelect.innerHTML = `<option value="all">${i18n.t("typeAll")}</option>`;
    types.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = utils.translateConsultType(t);
        if (t === selected) opt.selected = true;
        typeSelect.appendChild(opt);
    });
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

function getOutcomeBadge(outcome) {
    const o = (outcome || "").toLowerCase();
    const map = {
        benefited: { icon: "fa-circle-check", key: "outcomeBenefited", cls: "badge-outcome-benefited" },
        not_benefited: { icon: "fa-circle-xmark", key: "outcomeNotBenefited", cls: "badge-outcome-not_benefited" },
        unknown: { icon: "fa-question", key: "outcomeUnknown", cls: "badge-outcome-unknown" }
    };
    const cfg = map[o];
    if (!cfg) return `<span class="badge badge-inactive">${i18n.t("outcomeUnknown")}</span>`;
    return `<span class="badge ${cfg.cls}"><i class="fa-solid ${cfg.icon}"></i> ${i18n.t(cfg.key)}</span>`;
}

function renderDirectoryTable() {
    const tbody = document.getElementById("directoryTableBody");
    const emptyState = document.getElementById("emptyDirectoryState");
    if (!tbody) return;

    if (filteredDirectory.length === 0) {
        tbody.innerHTML = "";
        if (emptyState) emptyState.style.display = "block";
        return;
    }

    if (emptyState) emptyState.style.display = "none";

    tbody.innerHTML = filteredDirectory.map(c => {
        const followUpDate = c.followed_up_at ? utils.formatDate(c.followed_up_at, false) : "-";
        const patientName = utils.escHtml(c.patient_name || "-");
        const phone = utils.escHtml(c.phone || "-");
        return `
            <tr>
                <td><strong>${patientName}</strong></td>
                <td><a href="tel:${phone}" style="color: var(--primary); font-weight: 600;"><i class="fa-solid fa-phone"></i> ${phone}</a></td>
                <td>${utils.escHtml(utils.translateConsultType(c.consultation_type))}</td>
                <td>${getConsultStatusBadge(c.status)}</td>
                <td>${getOutcomeBadge(c.outcome)}</td>
                <td><small style="color: var(--text-muted);">${followUpDate}</small></td>
                <td>
                    <button class="btn btn-outline btn-sm" onclick="openFollowUpModal('${c.id}')">
                        <i class="fa-solid fa-clipboard-check"></i> ${i18n.currentLang === "ar" ? "متابعة المريض" : "Follow Up"}
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

// ------------------------------------------------------------------
// Follow-up Modal (record whether the patient benefited)
// ------------------------------------------------------------------
async function openFollowUpModal(id) {
    try {
        const { data, error } = await db.getClient()
            .from("consultations")
            .select("*")
            .eq("id", id)
            .maybeSingle();

        if (error || !data) {
            utils.showToast(i18n.t("errorGeneric"), "error");
            return;
        }

        // Rebuild the modal on every open. It used to be created once and reused,
        // so the save button kept the previous consultation's id in its onclick
        // and stayed stuck on the loading spinner after the first save.
        document.getElementById("followUpModal")?.remove();
        let modal = null;
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "followUpModal";
            modal.className = "modal-backdrop";
            modal.innerHTML = `
                <div class="modal-card" style="max-width: 560px;">
                    <div class="modal-header">
                        <h4 class="card-title" id="followUpModalTitle"></h4>
                        <button class="btn btn-icon btn-sm" onclick="closeFollowUpModal()"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <div class="modal-body">
                        <div id="followUpInfo" style="margin-bottom: 1rem;"></div>
                        <div style="display:grid;gap:0.9rem;">
                            <div>
                                <label style="font-weight:600; display:block; margin-bottom:0.4rem;">
                                    <i class="fa-solid fa-clipboard-check"></i> ${i18n.t("consultOutcome")} <span style="color:red;">*</span>
                                </label>
                                <select id="followUpOutcome" class="form-control">
                                    <option value="benefited" ${data.outcome === "benefited" ? "selected" : ""}>${i18n.t("outcomeBenefited")}</option>
                                    <option value="not_benefited" ${data.outcome === "not_benefited" ? "selected" : ""}>${i18n.t("outcomeNotBenefited")}</option>
                                    <option value="unknown" ${data.outcome === "unknown" ? "selected" : ""}>${i18n.t("outcomeUnknown")}</option>
                                </select>
                            </div>
                            <div>
                                <label style="font-weight:600; display:block; margin-bottom:0.4rem;">
                                    <i class="fa-solid fa-pen"></i> ${i18n.t("consultOutcomeNotes")}
                                </label>
                                <textarea id="followUpNotes" class="form-control" rows="4" placeholder="${i18n.t("outcomePlaceholder")}">${data.outcome_notes || ""}</textarea>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="closeFollowUpModal()">${i18n.t("cancel")}</button>
                        <button class="btn btn-primary" id="followUpSaveBtn" onclick="saveFollowUp('${data.id}')">
                            <i class="fa-solid fa-floppy-disk"></i> ${i18n.t("saveOutcome")}
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        document.getElementById("followUpModalTitle").textContent =
            `${i18n.t("consultDirectoryTitle")} - ${data.patient_name} (${data.phone})`;

        document.getElementById("followUpInfo").innerHTML = `
            <div style="background: var(--bg-surface-subtle); padding: 0.75rem; border-radius: var(--radius-md); display:grid; gap:0.35rem;">
                <p style="margin:0;"><strong>${i18n.t("consultType")}:</strong> ${utils.escHtml(utils.translateConsultType(data.consultation_type))}</p>
                <p style="margin:0;"><strong>${i18n.t("consultContactMethod")}:</strong> ${data.contact_method === "whatsapp" ? i18n.t("contactWhatsapp") : i18n.t("contactPhone")}</p>
                <p style="margin:0;"><strong>${i18n.t("consultDetails")}:</strong> ${utils.escHtml(data.details || "-")}</p>
            </div>
        `;

        document.getElementById("followUpOutcome").value = data.outcome || "unknown";
        document.getElementById("followUpNotes").value = data.outcome_notes || "";

        modal.classList.add("active");
    } catch (err) {
        console.error("Open follow-up modal error:", err);
        utils.showToast(i18n.t("errorGeneric"), "error");
    }
}

function closeFollowUpModal() {
    const modal = document.getElementById("followUpModal");
    if (modal) modal.classList.remove("active");
}

async function saveFollowUp(id) {
    const outcome = document.getElementById("followUpOutcome")?.value || "unknown";
    const notes = document.getElementById("followUpNotes")?.value || "";
    const btn = document.getElementById("followUpSaveBtn");

    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';

    try {
        const { data: updatedRows, error } = await db.getClient()
            .from("consultations")
            .update({
                outcome: outcome,
                outcome_notes: notes,
                followed_up_by: auth.user?.id || null,
                followed_up_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq("id", id)
            .select("id");

        if (error) throw error;

        // 0 rows = the consultation belongs to another branch (read-only for us)
        if (!updatedRows || updatedRows.length === 0) {
            utils.showToast(
                i18n.currentLang === "ar"
                    ? "لا يمكنك تعديل متابعة هذه الاستشارة لأنها تخص فرعاً آخر"
                    : "You cannot edit this consultation, it belongs to another branch",
                "error"
            );
            closeFollowUpModal();
            await loadDirectory();
            return;
        }

        utils.showToast(i18n.t("outcomeSaveSuccess"), "success");
        closeFollowUpModal();
        await loadDirectory();
    } catch (err) {
        console.error("Save follow-up error:", err);
        utils.showToast(i18n.t("errorGeneric"), "error");
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
}
