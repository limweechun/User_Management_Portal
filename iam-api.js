/* ============================================================================
 * Real IAM client (window.IAM) — talks to the IAM backend over HTTP.
 * Mirrors the same interface as the mock (iam.js) so app.js is unchanged.
 * Activated only when window.IAM_CONFIG.apiBase is set (see iam-config.js).
 * ==========================================================================*/
(function () {
  const CFG = window.IAM_CONFIG || {};
  const BASE = CFG.apiBase;
  if (!BASE) return; // mock stays in charge

  let _me = null; // cached /me result for synchronous getters

  async function req(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  }

  const RealIAM = {
    APP_IDS: ["hr", "procurement", "psm", "biogas", "rnd", "crm", "texcycle"],
    LEVELS: ["view", "edit", "admin"],
    LEVEL_LABEL: { view: "View", edit: "Edit", admin: "Admin" },

    // ---- Auth ----
    async register({ email, fullName, password }) { return req("POST", "/auth/register", { email, fullName, password }); },
    async verifyEmail(token) { return req("POST", "/auth/verify-email", { token }); },
    async login(email, password) { const r = await req("POST", "/auth/login", { email, password }); _me = null; return r; },
    logout() { _me = null; req("POST", "/auth/logout").catch(() => {}); },
    async me() { _me = await req("GET", "/me"); return _me; },

    // ---- Sync getters (read the cached /me) ----
    session() { return _me; },
    isAuthenticated() { return !!_me; },
    isSuperAdmin() { return !!_me && _me.platformRole === "superadmin"; },
    isPortalAdmin() { return !!_me && (_me.platformRole === "superadmin" || _me.platformRole === "admin"); },
    canUsePortal() {
      if (this.isPortalAdmin()) return true;
      const a = (_me && _me.apps) || {};
      return Object.keys(a).some((id) => a[id].isAppAdmin);
    },
    appsIAdminister() {
      const a = (_me && _me.apps) || {};
      if (this.isSuperAdmin()) return Object.keys(a);
      return Object.keys(a).filter((id) => a[id].isAppAdmin);
    },

    // ---- Per-app token (for the apps; portal doesn't navigate here) ----
    async appToken(app, companyId) { const r = await req("POST", "/app-token", { app, companyId }); return r.claims; },
    // Signed access token to launch an app at an external URL (LIVE backend issues it).
    async appAccessToken(app, companyId) { const r = await req("POST", "/app-token", { app, companyId }); return r.accessToken; },

    // ---- Admin: accounts ----
    async listUsers(filter) {
      const status = filter && filter.status ? filter.status : "all";
      const q = filter && filter.q ? filter.q : "";
      const qs = "?status=" + encodeURIComponent(status) + (q ? "&q=" + encodeURIComponent(q) : "");
      return req("GET", "/admin/users" + qs);
    },
    async createUser({ email, fullName, password, platformRole }) {
      return req("POST", "/admin/users", { email, fullName, password, platformRole: platformRole || "user" });
    },
    async updateUser(userId, patch) { return req("PATCH", "/admin/users/" + userId, patch); },
    async resetPassword(userId, password) { return req("POST", "/admin/users/" + userId + "/reset-password", { password }); },
    async listAudit(limit) { return req("GET", "/admin/audit?limit=" + (limit || 100)); },
    async approveAccount(userId) { return req("POST", "/admin/users/" + userId + "/approve"); },
    async setUserStatus(userId, status) {
      return req("POST", "/admin/users/" + userId + "/" + (status === "active" ? "activate" : "deactivate"));
    },
    async setPlatformRole(userId, role) { return req("PUT", "/admin/users/" + userId + "/platform-role", { platformRole: role }); },

    // ---- Admin: companies / apps / catalog ----
    async listCompanies() { return req("GET", "/admin/companies"); },
    async createCompany(name) { return req("POST", "/admin/companies", { name }); },
    async listApps() { return req("GET", "/admin/apps"); },
    async appCompanyLinks() { return req("GET", "/admin/app-companies"); },
    async listAppCompanies(appId) {
      const [links, cos] = await Promise.all([req("GET", "/admin/app-companies"), req("GET", "/admin/companies")]);
      const ids = new Set(links.filter((l) => l.appId === appId).map((l) => l.companyId));
      return cos.filter((c) => c.status === "active" && ids.has(c.id));
    },
    async setAppCompany(appId, companyId, enabled) {
      return req("PUT", "/admin/apps/" + appId + "/companies/" + companyId, { enabled });
    },

    // ---- Admin: entitlements (Stage 2) ----
    async setEntitlement(userId, appId, patch) { return req("PUT", "/admin/users/" + userId + "/entitlements/" + appId, patch); },

    // ---- Admin: company access (Stage 3) ----
    async setCompanyAccess(userId, appId, companyId, level) {
      return req("PUT", "/admin/users/" + userId + "/apps/" + appId + "/companies/" + companyId, { level });
    },
    async removeCompanyAccess(userId, appId, companyId) {
      return req("DELETE", "/admin/users/" + userId + "/apps/" + appId + "/companies/" + companyId);
    }
  };

  window.IAM = RealIAM;
  console.info("[IAM] Using live backend at", BASE);
})();
