// ==========================================================================
// صيدلية د.مصطفى فتحي حامد (Dr.Mostafa Fathy Hamed Pharmacy) - Order Details & Workflow Controller
// ==========================================================================

let currentOrder = null;

/** Reads both legacy single-file values and the JSON list used for new multi-file orders. */
function parsePrescriptionReferences(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter((item) => typeof item === "string" && item);
    const text = String(value).trim();
    if (!text) return [];
    if (text.startsWith("[")) {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === "string" && item);
        } catch (_) { /* Keep older single URL/path values supported. */ }
    }
    return [text];
}

document.addEventListener("DOMContentLoaded", async () => {
    utils.setupMobileSidebar();

    const isAuthed = await auth.init();
    if (!isAuthed) return;

    notifications.init();

    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get("id");

    if (!orderId) {
        window.location.href = "orders.html";
        return;
    }

    await loadOrderDetails(orderId);

    window.onRealtimeOrderUpdate = (updatedOrder) => {
        if (currentOrder && updatedOrder.id == currentOrder.id) {
            loadOrderDetails(currentOrder.id);
        }
    };

    window.onLanguageChange = () => {
        if (currentOrder) renderOrderUI(currentOrder);
    };
});

async function loadOrderDetails(orderId) {
    try {
        const client = db.getClient();
        const { data, error } = await client
            .from("orders")
            .select("*, branches(name_ar, name_en), order_items(*)")
            .eq("id", orderId)
            .single();

        if (error || !data) {
            throw error || new Error("Order not found");
        }

        currentOrder = data;
        renderOrderUI(data);
        await loadPrescriptionSignedLink(data.prescription_url || data.prescription_path);
        loadStatusHistory(data.id);

    } catch (err) {
        console.error("Load order details error:", err);
        utils.showToast(i18n.t("errorGeneric"), "error");
    }
}

function renderOrderUI(order) {

    /**
     * Escapes plain text then turns any http(s) URL found inside it into a
     * clickable "فتح في خرائط جوجل" link, so the raw Google Maps link the
     * customer's device sent gets rendered as a real button instead of
     * plain text. Preserves line breaks via white-space handling in CSS.
     */
    function linkifyAddress(text) {
        if (!text) return "-";
        const escaped = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        return escaped.replace(/(https?:\/\/[^\s<]+)/g, (url) => `
            <a href="${url}" target="_blank" rel="noopener noreferrer"
               style="color: var(--primary); font-weight: 700; display: inline-flex; align-items: center; gap: 0.3rem;">
                <i class="fa-solid fa-location-dot"></i> فتح الموقع في خرائط جوجل
            </a>
        `);
    }

    /**
     * Extracts any prescription-attachment reference lines that script.js
     * appends to customer notes (e.g. "روشتة مرفقة: <url>"), removes them
     * from the displayed notes text, and returns how many were found so
     * a count is shown instead of a raw storage link. Every attachment URL
     * is also collected in `urls` so each image can be opened individually.
     */
    function extractPrescriptionAttachments(text) {
        if (!text) return { cleanText: "", count: 0, urls: [] };

        const lines = text.split("\n");
        let count = 0;
        const urls = [];

        const remainingLines = lines.filter((line) => {
            const isAttachmentLine =
                /روشتة مرفقة/.test(line) ||
                /https?:\/\/[^\s<]*\/prescriptions\//.test(line);

            if (isAttachmentLine) {
                count++;
                const urlMatch = line.match(/https?:\/\/[^\s<]+/);
                if (urlMatch) urls.push(urlMatch[0]);
                return false;
            }
            if (/\[سبب الإلغاء\]:/.test(line)) {
                return false;
            }
            return true;
        });

        return { cleanText: remainingLines.join("\n").trim(), count, urls };
    }

    function extractCancellationReason(ord) {
        if (ord.cancellation_reason && ord.cancellation_reason.trim()) {
            return ord.cancellation_reason.trim();
        }
        if (ord.notes) {
            const match = ord.notes.match(/\[سبب الإلغاء\]:\s*([^\n\r]+)/);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        return "";
    }

    const tracking = order.tracking_code || `#${order.id}`;
    const cancellationReason = extractCancellationReason(order);
    
    // Header
    const titleEl = document.getElementById("orderDetailTitle");
    const statusBadgeEl = document.getElementById("orderDetailStatusBadge");
    const typeBadgeEl = document.getElementById("orderDetailTypeBadge");
    
    if (titleEl) titleEl.textContent = `${i18n.t("orderId")}: ${tracking}`;
    if (statusBadgeEl) statusBadgeEl.innerHTML = utils.getStatusBadge(order.status);
    if (typeBadgeEl) typeBadgeEl.innerHTML = utils.getOrderTypeBadge(order.order_type || order.delivery_method);

    // Customer Info
    const custNameEl = document.getElementById("orderCustomerName");
    const custPhoneEl = document.getElementById("orderCustomerPhone");
    const custAddressEl = document.getElementById("orderCustomerAddress");
    const orderDateEl = document.getElementById("orderCreatedAt");
    const orderNotesEl = document.getElementById("orderCustomerNotes");
    const orderBranchEl = document.getElementById("orderAssignedBranch");
    const cancelReasonContainer = document.getElementById("orderCancellationReasonContainer");
    const cancelReasonText = document.getElementById("orderCancellationReasonText");

    if (custNameEl) custNameEl.textContent = order.customer_name || "-";
    const phoneSafe = utils.escHtml(order.phone || "");
    if (custPhoneEl) custPhoneEl.innerHTML = `<a href="tel:${phoneSafe}" style="color: var(--primary); font-weight: 600;"><i class="fa-solid fa-phone"></i> ${phoneSafe}</a>`;
    if (custAddressEl) custAddressEl.innerHTML = linkifyAddress(order.address);
    if (orderDateEl) orderDateEl.textContent = utils.formatDate(order.created_at, true);
    if (orderNotesEl) {
        const { cleanText, count, urls: legacyUrls } = extractPrescriptionAttachments(order.notes);
        const urls = Array.from(new Set([
            ...parsePrescriptionReferences(order.prescription_url || order.prescription_path),
            ...legacyUrls
        ]));
        const attachmentCount = Math.max(count, urls.length);

        const parts = [];

        if (cleanText) parts.push(linkifyAddress(cleanText));

        if (attachmentCount > 0) {
            parts.push(
                i18n.currentLang === "ar"
                    ? `📎 عدد الروشتات/الصور المرفقة: ${attachmentCount}`
                    : `📎 Attached prescriptions/photos: ${attachmentCount}`
            );
        }

        // One tappable link per attached image; the href is filled in by
        // resolveRxAttachmentLinks() with a temporary signed URL.
        if (urls.length) {
            parts.push(
                urls
                    .map(
                        (u, i) => `
                <a data-rx-url="${utils.escHtml(u)}" target="_blank" rel="noopener noreferrer"
                   style="display: inline-flex; align-items: center; gap: 0.35rem; color: var(--primary); font-weight: 700; margin-top: 0.35rem;">
                    <i class="fa-solid fa-image"></i> ${i18n.t("attachmentLabel")} ${i + 1}
                </a>`
                    )
                    .join("<br>")
            );
        }

        orderNotesEl.innerHTML = parts.length ? parts.join("<br><br>") : "-";
        resolveRxAttachmentLinks(orderNotesEl);
    }
    if (orderBranchEl) {
        const branchName = order.branches 
            ? (i18n.currentLang === "en" ? (order.branches.name_en || order.branches.name_ar) : order.branches.name_ar)
            : i18n.t("branchAll");
        orderBranchEl.textContent = branchName;
    }

    // Cancellation Reason Box in Customer details card
    if (cancelReasonContainer && cancelReasonText) {
        if (order.status === "cancelled") {
            cancelReasonContainer.style.display = "block";
            cancelReasonText.textContent = cancellationReason || i18n.t("cancellationReasonNone");
        } else {
            cancelReasonContainer.style.display = "none";
        }
    }

    // Financials
    const subtotalEl = document.getElementById("orderSubtotal");
    const deliveryFeeEl = document.getElementById("orderDeliveryFee");
    const totalEl = document.getElementById("orderGrandTotal");

    if (subtotalEl) subtotalEl.textContent = utils.formatCurrency(order.subtotal || order.total || 0);
    if (deliveryFeeEl) deliveryFeeEl.textContent = utils.formatCurrency(order.delivery_fee || 0);
    if (totalEl) totalEl.textContent = utils.formatCurrency(order.total || 0);

    // Products table
    renderProductsTable(order);

    // Status Workflow Buttons
    renderWorkflowActions(order.status, order.order_type || order.delivery_method, cancellationReason);
}

function renderProductsTable(order) {
    const tbody = document.getElementById("orderItemsTableBody");
    if (!tbody) return;

    if (order.order_items && order.order_items.length > 0) {
        tbody.innerHTML = order.order_items.map(item => `
            <tr>
                <td><strong>${utils.escHtml(item.product_name_snapshot || "-")}</strong></td>
                <td>${item.quantity}</td>
                <td>${utils.formatCurrency(item.unit_price)}</td>
                <td><strong style="color: var(--primary);">${utils.formatCurrency(item.total_price)}</strong></td>
            </tr>
        `).join("");
    } else {
        // Parse medications plain text if historical plain text format
        const medText = utils.escHtml(order.medications || "-");
        tbody.innerHTML = `
            <tr>
                <td colspan="4">
                    <div style="padding: 0.5rem 0; line-height: 1.6; white-space: pre-line;">
                        <strong>${i18n.currentLang === "ar" ? "الأدوية والمطلوبات المسجلة:" : "Requested Items:"}</strong><br>
                        ${medText}
                    </div>
                </td>
            </tr>
        `;
    }
}

function renderWorkflowActions(status, orderType, cancellationReason = "") {
    const container = document.getElementById("orderWorkflowActions");
    if (!container) return;

    const s = (status || "new").toLowerCase();
    const isDelivery = (orderType || "").toLowerCase().includes("delivery") || (orderType || "").includes("توصيل");
    let buttonsHtml = "";

    if (s === "new") {
        buttonsHtml = `
            <button class="btn btn-primary" onclick="updateOrderStatus('confirmed')">
                <i class="fa-solid fa-check"></i> ${i18n.t("actionConfirm")}
            </button>
            <button class="btn btn-danger" onclick="confirmCancelOrder()">
                <i class="fa-solid fa-ban"></i> ${i18n.t("actionCancelOrder")}
            </button>
        `;
    } else if (s === "confirmed") {
        buttonsHtml = `
            <button class="btn btn-primary" onclick="updateOrderStatus('ready')">
                <i class="fa-solid fa-box-check"></i> ${i18n.t("actionMarkReady")}
            </button>
            <button class="btn btn-danger" onclick="confirmCancelOrder()">
                <i class="fa-solid fa-ban"></i> ${i18n.t("actionCancelOrder")}
            </button>
        `;
    } else if (s === "ready") {
        if (isDelivery) {
            buttonsHtml = `
                <button class="btn btn-primary" onclick="updateOrderStatus('out_for_delivery')">
                    <i class="fa-solid fa-truck-fast"></i> ${i18n.t("actionOutForDelivery")}
                </button>
            `;
        } else {
            buttonsHtml = `
                <button class="btn btn-primary" onclick="updateOrderStatus('completed')">
                    <i class="fa-solid fa-circle-check"></i> ${i18n.t("actionCompleteOrder")}
                </button>
            `;
        }
    } else if (s === "out_for_delivery") {
        buttonsHtml = `
            <button class="btn btn-primary" onclick="updateOrderStatus('completed')">
                <i class="fa-solid fa-circle-check"></i> ${i18n.t("actionCompleteOrder")}
            </button>
        `;
    } else if (s === "cancelled") {
        buttonsHtml = `
            <div class="cancellation-banner">
                <div class="cancellation-banner-icon">
                    <i class="fa-solid fa-ban"></i>
                </div>
                <div class="cancellation-banner-content">
                    <div class="cancellation-banner-title">
                        <i class="fa-solid fa-triangle-exclamation" style="margin-inline-end: 0.35rem;"></i>
                        ${i18n.t("orderCancelledBannerTitle")}
                    </div>
                    <div class="cancellation-banner-reason">
                        <strong>${i18n.t("cancellationReason")}:</strong>
                        <span>${utils.escHtml(cancellationReason) || i18n.t("cancellationReasonNone")}</span>
                    </div>
                </div>
            </div>
        `;
    } else {
        // completed -> No further action
        buttonsHtml = `
            <span style="color: var(--text-muted); font-size: 0.85rem; font-style: italic;">
                <i class="fa-solid fa-circle-check" style="color: var(--primary); margin-inline-end: 0.35rem;"></i>
                ${i18n.currentLang === "ar" ? "هذا الطلب مكتمل وتم تسليمه بنجاح." : "This order has been completed successfully."}
            </span>
        `;
    }

    container.innerHTML = buttonsHtml;
}

async function updateOrderStatus(newStatus, cancellationReason = null) {
    if (!currentOrder) return;
    const oldStatus = currentOrder.status;

    try {
        const client = db.getClient();

        // 1. Update orders table
        const updatePayload = {
            status: newStatus,
            updated_at: new Date().toISOString()
        };

        if (newStatus === "cancelled" && cancellationReason) {
            updatePayload.cancellation_reason = cancellationReason;
        }

        let { error: updateError } = await client
            .from("orders")
            .update(updatePayload)
            .eq("id", currentOrder.id);

        // Fallback if column 'cancellation_reason' doesn't exist in Supabase yet
        if (updateError && (updateError.message?.includes("cancellation_reason") || updateError.code === "PGRST204" || updateError.code === "42703")) {
            console.warn("cancellation_reason column not found in orders table, using fallback storage:", updateError);
            delete updatePayload.cancellation_reason;
            const fallbackNote = `\n[سبب الإلغاء]: ${cancellationReason}`;
            updatePayload.notes = currentOrder.notes ? `${currentOrder.notes}${fallbackNote}` : `[سبب الإلغاء]: ${cancellationReason}`;
            
            const retryRes = await client
                .from("orders")
                .update(updatePayload)
                .eq("id", currentOrder.id);
            if (retryRes.error) throw retryRes.error;
        } else if (updateError) {
            throw updateError;
        }

        // 2. Pharmacist took action → stop the persistent alert for this order
        notifications.removePendingAlert(String(currentOrder.id));

        // 3. Insert audit log if status history table exists
        try {
            await client.from("order_status_history").insert({
                order_id: currentOrder.id,
                old_status: oldStatus,
                new_status: newStatus,
                notes: cancellationReason || null,
                changed_by: auth.user?.id || null
            });
        } catch (auditErr) {
            console.warn("Audit history optional insert:", auditErr);
        }

        utils.showToast(i18n.t("statusUpdateSuccess"), "success");
        await loadOrderDetails(currentOrder.id);

    } catch (err) {
        console.error("Update order status error:", err);
        utils.showToast(i18n.t("errorGeneric"), "error");
    }
}

function confirmCancelOrder() {
    openCancelOrderModal();
}

function openCancelOrderModal() {
    const modal = document.getElementById("cancelOrderModal");
    const input = document.getElementById("cancelReasonInput");
    const err = document.getElementById("cancelReasonError");
    if (!modal) return;

    if (input) input.value = "";
    if (err) err.style.display = "none";
    document.querySelectorAll(".cancellation-chips .btn-chip").forEach(btn => btn.classList.remove("active"));

    modal.classList.add("active");
    if (input) setTimeout(() => input.focus(), 100);
}

function closeCancelOrderModal() {
    const modal = document.getElementById("cancelOrderModal");
    if (modal) modal.classList.remove("active");
}

function setCancelReasonText(text) {
    const input = document.getElementById("cancelReasonInput");
    const err = document.getElementById("cancelReasonError");
    if (input) {
        input.value = text;
        input.focus();
    }
    if (err) err.style.display = "none";

    document.querySelectorAll(".cancellation-chips .btn-chip").forEach(btn => {
        if (btn.textContent.trim() === text || text.includes(btn.textContent.trim())) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
}

async function submitCancelOrder() {
    const input = document.getElementById("cancelReasonInput");
    const err = document.getElementById("cancelReasonError");
    const reason = input ? input.value.trim() : "";

    if (!reason) {
        if (err) err.style.display = "block";
        if (input) input.focus();
        return;
    }

    const submitBtn = document.getElementById("confirmCancelOrderBtn");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${i18n.currentLang === 'ar' ? 'جاري الإلغاء...' : 'Cancelling...'}`;
    }

    try {
        await updateOrderStatus("cancelled", reason);
        closeCancelOrderModal();
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fa-solid fa-ban"></i> <span>${i18n.t("cancelOrderConfirmBtn")}</span>`;
        }
    }
}

/**
 * Replaces each `data-rx-url` placeholder link in the notes area with a
 * temporary signed URL, so every attached image opens even though the
 * prescriptions bucket is private. Failed links stay disabled rather than
 * navigating to a relative path inside the dashboard site.
 */
async function resolveRxAttachmentLinks(container) {
    if (!container) return;

    const links = container.querySelectorAll("a[data-rx-url]");

    await Promise.all(
        Array.from(links).map(async (anchor) => {
            const raw = anchor.getAttribute("data-rx-url");
            if (!raw) return;
            const secureUrl = await db.getPrescriptionSignedUrl(raw);
            if (secureUrl) {
                anchor.href = secureUrl;
            } else {
                anchor.removeAttribute("href");
                anchor.removeAttribute("target");
                anchor.setAttribute("aria-disabled", "true");
                anchor.title = i18n.t("prescriptionOpenError");
                anchor.style.opacity = "0.6";
                anchor.style.cursor = "not-allowed";
            }
        })
    );
}

async function loadPrescriptionSignedLink(rxUrl) {
    const rxBox = document.getElementById("orderPrescriptionContainer");
    if (!rxBox) return;

    if (!rxUrl) {
        rxBox.innerHTML = `
            <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); background: var(--bg-surface-subtle); border-radius: var(--radius-md);">
                <i class="fa-solid fa-file-circle-xmark" style="font-size: 2rem; margin-bottom: 0.5rem; color: var(--text-subtle);"></i>
                <p>${i18n.t("noPrescriptionUploaded")}</p>
            </div>
        `;
        return;
    }

    const references = parsePrescriptionReferences(rxUrl);
    const firstReference = references[0];
    if (!firstReference) {
        rxBox.innerHTML = `
            <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); background: var(--bg-surface-subtle); border-radius: var(--radius-md);">
                <i class="fa-solid fa-file-circle-xmark" style="font-size: 2rem; margin-bottom: 0.5rem; color: var(--text-subtle);"></i>
                <p>${i18n.t("noPrescriptionUploaded")}</p>
            </div>
        `;
        return;
    }

    rxBox.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; color: var(--text-muted);">
            <i class="fa-solid fa-spinner fa-spin"></i> ${i18n.t("prescriptionLoading")}
        </div>
    `;

    const secureUrl = await db.getPrescriptionSignedUrl(firstReference);
    if (!secureUrl) {
        rxBox.innerHTML = `
            <div role="status" style="padding: 1.25rem; color: var(--danger); background: rgba(239, 68, 68, 0.08); border-radius: var(--radius-md);">
                <i class="fa-solid fa-triangle-exclamation"></i>
                ${i18n.t("prescriptionOpenError")}
            </div>
        `;
        return;
    }
    const safeUrl = utils.escHtml(secureUrl || "");
    const isPdf = /\.pdf(?:$|[?#])/i.test(firstReference);

    rxBox.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 1rem; align-items: flex-start;">
            ${isPdf ? "" : `
                <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden; max-height: 350px; width: 100%; display: flex; justify-content: center; background: #000;">
                    <img src="${safeUrl}" alt="Prescription" style="max-width: 100%; max-height: 350px; object-fit: contain;" onerror="this.parentElement.innerHTML='<div style=\'padding: 2rem; color: #fff;\'>ملف الروشتة متاح للتحميل أو العرض بالرابط أدناه</div>'">
                </div>
            `}
            <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> ${i18n.t("viewPrescription")}${references.length > 1 ? " 1" : ""}
            </a>
            ${references.length > 1 ? `<small style="color: var(--text-muted);">${references.length} مرفقات في الطلب. استخدم قائمة المرفقات بجانب بيانات العميل لفتح كل صورة.</small>` : ""}
        </div>
    `;
}

async function loadStatusHistory(orderId) {
    const timelineEl = document.getElementById("orderStatusHistoryTimeline");
    if (!timelineEl) return;

    try {
        const { data, error } = await db.getClient()
            .from("order_status_history")
            .select("*, profiles(full_name)")
            .eq("order_id", orderId)
            .order("created_at", { ascending: false });

        if (error || !data || data.length === 0) {
            timelineEl.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem;">-</p>`;
            return;
        }

        timelineEl.innerHTML = data.map(h => {
            const rawStatus = (h.new_status || "").toLowerCase();
            const statusLabelKey = "status" + rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);
            const statusLabel = i18n.t(statusLabelKey) || h.new_status;
            const noteHtml = h.notes 
                ? `<div style="margin-top: 0.3rem; color: #DC2626; font-size: 0.8rem; background: rgba(239,68,68,0.08); padding: 0.35rem 0.6rem; border-radius: var(--radius-sm); border-inline-start: 3px solid #DC2626;"><strong>${i18n.t("cancellationReason")}:</strong> ${utils.escHtml(h.notes)}</div>` 
                : "";

            return `
            <div style="padding: 0.5rem 0; border-bottom: 1px dashed var(--border-color); font-size: 0.85rem;">
                <strong>${statusLabel}</strong> 
                <span style="color: var(--text-muted); font-size: 0.75rem;">(${utils.formatDate(h.created_at, true)})</span>
                ${h.profiles?.full_name ? `<br><small style="color: var(--text-subtle);">بواسطة: ${h.profiles.full_name}</small>` : ""}
                ${noteHtml}
            </div>
            `;
        }).join("");
    } catch (e) {
        timelineEl.innerHTML = "";
    }
}
