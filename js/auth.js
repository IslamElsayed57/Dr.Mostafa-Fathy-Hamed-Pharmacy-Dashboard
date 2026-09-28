// ==========================================================================
// صيدلية د.مصطفى فتحي حامد (Dr.Mostafa Fathy Hamed Pharmacy) - Authentication & Profile Guard
// ==========================================================================

class AuthService {
    constructor() {
        this.user = null;
        this.profile = null;
        this.branch = null;
    }

    /**
     * Initializes auth state, checks session, fetches user profile
     * @param {boolean} isLoginPage - Whether the current page is login.html
     */
    async init(isLoginPage = false) {
        try {
            const { data: { session }, error } = await db.getClient().auth.getSession();

            if (error || !session) {
                if (!isLoginPage) {
                    window.location.href = "login.html";
                }
                return false;
            }

            this.user = session.user;
            await this.loadUserProfile();

            // SECURITY FIX (F11): If no DB profile exists, reject session & sign out
            if (!this.profile) {
                console.warn("No profile found for user:", this.user.id);
                await this.signOut();
                alert(typeof i18n !== "undefined" && i18n.t("noProfileError") ? i18n.t("noProfileError") : "حسابك غير مسجل في النظام. يرجى التواصل مع المسؤول.");
                window.location.href = "login.html";
                return false;
            }

            // If profile is inactive, force sign out
            if (this.profile && !this.profile.is_active) {
                await this.signOut();
                alert(i18n.t("inactiveAccountError"));
                window.location.href = "login.html";
                return false;
            }

            if (isLoginPage) {
                window.location.href = "dashboard.html";
                return true;
            }

            this.renderUserUI();
            this.enforceRolePermissions();
            return true;
        } catch (err) {
            console.error("Auth initialization error:", err);
            if (!isLoginPage) window.location.href = "login.html";
            return false;
        }
    }

    async loadUserProfile() {
        if (!this.user) return;

        try {
            const { data, error } = await db.getClient()
                .from("profiles")
                .select("*, branches(name_ar, name_en)")
                .eq("id", this.user.id)
                .maybeSingle();

            if (error) {
                console.warn("Could not load profile:", error);
                this.profile = null;
            } else if (data) {
                this.profile = data;
                this.branch = data.branches || null;
            } else {
                // SECURITY FIX (F11): Do NOT fallback to default admin profile.
                // If user has no profile in DB, set profile to null (access denied).
                this.profile = null;
            }
        } catch (err) {
            console.error("Error loading user profile:", err);
            this.profile = null;
        }
    }

    async signIn(email, password) {
        try {
            const { data, error } = await db.getClient().auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            this.user = data.user;
            await this.loadUserProfile();

            if (this.profile && !this.profile.is_active) {
                await this.signOut();
                throw new Error(i18n.t("inactiveAccountError"));
            }

            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async signOut() {
        try {
            await db.getClient().auth.signOut();
        } catch (e) {
            console.error("Sign out error:", e);
        } finally {
            this.user = null;
            this.profile = null;
            window.location.href = "login.html";
        }
    }

    isAdmin() {
        return this.profile?.role === "admin";
    }

    isPharmacist() {
        return this.profile?.role === "pharmacist";
    }

    getUserBranchId() {
        return this.profile?.branch_id || null;
    }

    renderUserUI() {
        if (!this.profile) return;

        // Sidebar user info
        const userNameEl = document.getElementById("sidebarUserName");
        const userRoleEl = document.getElementById("sidebarUserRole");
        const userAvatarEl = document.getElementById("sidebarUserAvatar");

        if (userNameEl) userNameEl.textContent = this.profile.full_name || this.user.email;
        if (userRoleEl) userRoleEl.textContent = this.isAdmin() ? i18n.t("roleAdmin") : i18n.t("rolePharmacist");
        if (userAvatarEl) {
            const initial = (this.profile.full_name || this.user.email || "U").charAt(0).toUpperCase();
            userAvatarEl.textContent = initial;
        }

        // Admin-only elements are hidden by default directly in the HTML
        // (inline style="display:none") so a pharmacist never sees them
        // flash on screen while the profile is still loading. Now that we
        // know the confirmed role, reveal them for admins only.
        if (this.isAdmin()) {
            document.querySelectorAll(".admin-only-nav, .admin-only").forEach(el => {
                el.style.display = "";
            });
        }

        // Topbar Branch Badge
        const branchBadge = document.getElementById("topbarBranchIndicator");
        if (branchBadge) {
            if (this.isAdmin()) {
                branchBadge.innerHTML = `<i class="fa-solid fa-hospital"></i> <span>${i18n.t("branchAll")}</span>`;
            } else if (this.branch) {
                const bName = i18n.currentLang === "en" ? (this.branch.name_en || this.branch.name_ar) : this.branch.name_ar;
                branchBadge.innerHTML = `<i class="fa-solid fa-store"></i> <span>${bName}</span>`;
            } else {
                branchBadge.innerHTML = `<i class="fa-solid fa-store"></i> <span>${i18n.t("branchAssigned")}</span>`;
            }
        }
    }

    enforceRolePermissions() {
        if (this.isPharmacist()) {
            // Admin-only elements are already hidden from first paint via
            // inline style in the HTML — nothing to hide here anymore.
            // Block direct URL access to any admin-only page, not just
            // the ones that happen to have a hidden nav link — a pharmacist
            // typing the URL manually must be bounced too.
            const adminOnlyPages = [
                "staff.html",
                "reports.html",
                "settings.html"
            ];

            const currentPage = window.location.pathname.split("/").pop();
            if (adminOnlyPages.includes(currentPage)) {
                window.location.href = "orders.html";
            }
        }
    }
}

// Global Singleton
const auth = new AuthService();
