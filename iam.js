/* ============================================================================
 * IAM client  (window.IAM)  — MOCK backed by localStorage
 * ----------------------------------------------------------------------------
 * Implements the approved IAM_CONTRACT so the portal is usable before the real
 * service exists. Every method is async (mirrors REST). Going live = replace the
 * method bodies with fetch() to /api/v1 (SWAP POINTS marked).
 *
 * Model (full multi-company):
 *   users.platform_role: superadmin | admin(portal admin) | user
 *   app_entitlements(user, app, isAppAdmin, canApproveDeletions)  <- superadmin
 *   app_access(user, app, company, level: view|edit|admin)        <- app admin
 *   Deletions: superadmin (global) OR an app admin granted can_approve_deletions.
 * ==========================================================================*/
(function () {
  const DB_KEY = "iam_db_v2";
  const SESSION_KEY = "iam_id_v2";
  const APP_IDS = ["hr", "procurement", "psm", "biogas", "rnd", "crm", "texcycle"];
  const LEVELS = ["view", "edit", "admin"];

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.floor(Math.random() * 1e6));
  const settle = (v) => new Promise((res) => setTimeout(() => res(v), 50));
  const fail = (m) => { throw new Error(m); };

  // ---- Seed ---------------------------------------------------------------
  function seed() {
    const companies = [
      { id: "c-liziz", name: "Liziz Holdings", slug: "liziz", status: "active" },
      { id: "c-acme", name: "Acme Engineering", slug: "acme", status: "active" }
    ];
    const apps = [
      { id: "hr", name: "HR & Admin", icon: "users", url: "/hr" },
      { id: "procurement", name: "Procurement", icon: "shopping-cart", url: "/procurement" },
      { id: "psm", name: "Project, Service Job And Goods Supply Management", icon: "package", url: "/psm" },
      { id: "biogas", name: "Liziz Biogas Plant", icon: "factory", url: "/biogas" },
      { id: "rnd", name: "R&D Hub", icon: "flask-conical", url: "/rnd" },
      { id: "crm", name: "CRM", icon: "handshake", url: "/crm" },
      { id: "texcycle", name: "Tex Cycle Biomass Power Plant", icon: "zap", url: "/texcycle" }
    ];
    const users = [
      { id: "u-super",  email: "super@liziz.com",   password: "super123",   fullName: "Super Admin",   status: "active",  emailVerified: true,  platformRole: "superadmin" },
      { id: "u-portal", email: "portal@liziz.com",  password: "portal123",  fullName: "Portal Admin",  status: "active",  emailVerified: true,  platformRole: "admin" },
      { id: "u-hradm",  email: "hradmin@liziz.com", password: "hradmin123", fullName: "Hana (HR Admin)", status: "active", emailVerified: true, platformRole: "user" },
      { id: "u-jane",   email: "jane@liziz.com",    password: "jane123",    fullName: "Jane Doe",      status: "active",  emailVerified: true,  platformRole: "user" },
      { id: "u-bob",    email: "bob@acme.com",      password: "bob123",     fullName: "Bob Tan",       status: "active",  emailVerified: true,  platformRole: "user" },
      { id: "u-pending",email: "newbie@liziz.com",  password: "newbie123",  fullName: "Newbie Lim",    status: "pending", emailVerified: false, platformRole: "user" }
    ];
    const entitlements = [
      // Hana is the HR app admin and may approve HR deletions.
      { id: uid(), userId: "u-hradm", appId: "hr", isAppAdmin: true, canApproveDeletions: true },
      // Jane is entitled to HR and PSM (plain member).
      { id: uid(), userId: "u-jane", appId: "hr", isAppAdmin: false, canApproveDeletions: false },
      { id: uid(), userId: "u-jane", appId: "psm", isAppAdmin: false, canApproveDeletions: false },
      // Bob is entitled to Procurement.
      { id: uid(), userId: "u-bob", appId: "procurement", isAppAdmin: false, canApproveDeletions: false },
      // Jane is the R&D Hub app admin (can approve deletions); Hana is a plain R&D member.
      { id: uid(), userId: "u-jane", appId: "rnd", isAppAdmin: true, canApproveDeletions: true },
      { id: uid(), userId: "u-hradm", appId: "rnd", isAppAdmin: false, canApproveDeletions: false }
    ];
    const access = [
      { id: uid(), userId: "u-hradm", appId: "hr", companyId: "c-liziz", level: "admin" },
      { id: uid(), userId: "u-jane", appId: "hr", companyId: "c-liziz", level: "edit" },
      { id: uid(), userId: "u-jane", appId: "psm", companyId: "c-acme", level: "view" },
      { id: uid(), userId: "u-bob", appId: "procurement", companyId: "c-acme", level: "edit" },
      { id: uid(), userId: "u-jane", appId: "rnd", companyId: "c-liziz", level: "admin" },
      { id: uid(), userId: "u-hradm", appId: "rnd", companyId: "c-liziz", level: "view" }
    ];
    // Which companies each app is "set up" for (central per-app company list).
    const appCompanies = [
      { appId: "hr", companyId: "c-liziz" }, { appId: "hr", companyId: "c-acme" },
      { appId: "procurement", companyId: "c-acme" },
      { appId: "psm", companyId: "c-acme" },
      { appId: "biogas", companyId: "c-liziz" },
      { appId: "rnd", companyId: "c-liziz" }, { appId: "rnd", companyId: "c-acme" },
      { appId: "crm", companyId: "c-liziz" }, { appId: "crm", companyId: "c-acme" }
    ];
    return { companies, apps, users, entitlements, access, appCompanies };
  }

  function loadDb() {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const db = JSON.parse(raw);
      if (!db.appCompanies) db.appCompanies = []; // backfill older stores
      if (!db.audit) db.audit = [];               // backfill audit log
      return db;
    }
    const db = seed();
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    return db;
  }
  function saveDb(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

  // ---- Identity session (mock token) -------------------------------------
  const enc = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
  const dec = (t) => { try { return JSON.parse(decodeURIComponent(escape(atob(t)))); } catch (e) { return null; } };
  function readSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = dec(raw);
    if (!s || !s.exp || Date.now() > s.exp) { localStorage.removeItem(SESSION_KEY); return null; }
    return s;
  }
  function writeSession(user) {
    localStorage.setItem(SESSION_KEY, enc({
      sub: user.id, userId: user.id, email: user.email, name: user.fullName,
      platformRole: user.platformRole, status: user.status,
      exp: Date.now() + 8 * 3600 * 1000
    }));
  }

  // ---- Helpers ------------------------------------------------------------
  const userById = (db, id) => db.users.find((u) => u.id === id);
  // Record an admin action in the mock audit log (mirrors the live /admin/audit shape).
  function pushAudit(db, s, action, targetUserId, detail) {
    if (!db.audit) db.audit = [];
    db.audit.unshift({
      id: uid(), action,
      actor: s ? s.email : null,
      target: targetUserId ? ((userById(db, targetUserId) || {}).email || targetUserId) : null,
      appId: null, companyId: null, detail: detail || null,
      createdAt: new Date().toISOString()
    });
    if (db.audit.length > 500) db.audit.length = 500;
  }
  const entOf = (db, userId, appId) => db.entitlements.find((e) => e.userId === userId && e.appId === appId);
  const companyName = (db, id) => (db.companies.find((c) => c.id === id) || {}).name;
  const appHasCompany = (db, appId, companyId) => db.appCompanies.some((ac) => ac.appId === appId && ac.companyId === companyId);
  // Active companies a given app is set up for.
  const companiesForApp = (db, appId) =>
    db.companies.filter((c) => c.status === "active" && appHasCompany(db, appId, c.id));

  function appsForUser(db, userId) {
    const user = userById(db, userId);
    const out = {};
    // Super admin has implicit full access to every app + active company.
    if (user.platformRole === "superadmin") {
      db.apps.forEach((a) => {
        out[a.id] = {
          isAppAdmin: true, canApproveDeletions: true,
          companies: db.companies.filter((c) => c.status === "active")
            .map((c) => ({ companyId: c.id, name: c.name, level: "admin" }))
        };
      });
      return out;
    }
    db.entitlements.filter((e) => e.userId === userId).forEach((e) => {
      const companies = db.access
        .filter((a) => a.userId === userId && a.appId === e.appId)
        .map((a) => ({ companyId: a.companyId, name: companyName(db, a.companyId), level: a.level }));
      out[e.appId] = {
        isAppAdmin: e.isAppAdmin,
        canApproveDeletions: user.platformRole === "superadmin" || e.canApproveDeletions,
        companies
      };
    });
    return out;
  }

  function publicUser(db, u) {
    return {
      id: u.id, email: u.email, fullName: u.fullName, status: u.status,
      emailVerified: u.emailVerified, platformRole: u.platformRole,
      entitlements: db.entitlements.filter((e) => e.userId === u.id).map((e) => ({
        appId: e.appId, appName: (db.apps.find((a) => a.id === e.appId) || {}).name,
        isAppAdmin: e.isAppAdmin, canApproveDeletions: e.canApproveDeletions,
        companies: db.access.filter((a) => a.userId === u.id && a.appId === e.appId)
          .map((a) => ({ companyId: a.companyId, name: companyName(db, a.companyId), level: a.level }))
      }))
    };
  }

  // current session as a privilege object
  function sess() { return readSession(); }
  const isSuper = (s) => !!s && s.platformRole === "superadmin";
  const isPortalAdmin = (s) => !!s && (s.platformRole === "superadmin" || s.platformRole === "admin");
  function isAppAdminFor(db, s, appId) {
    if (!s) return false;
    if (s.platformRole === "superadmin") return true;
    const e = entOf(db, s.sub, appId);
    return !!e && e.isAppAdmin;
  }
  function appsIAdmin(db, s) {
    if (!s) return [];
    if (s.platformRole === "superadmin") return db.apps.map((a) => a.id);
    return db.entitlements.filter((e) => e.userId === s.sub && e.isAppAdmin).map((e) => e.appId);
  }

  const IAM = {
    APP_IDS, LEVELS,
    LEVEL_LABEL: { view: "View", edit: "Edit", admin: "Admin" },

    // ---- AUTH (SWAP: fetch /api/v1/auth/*) -------------------------------
    async register({ email, fullName, password }) {
      const db = loadDb();
      email = String(email || "").trim().toLowerCase();
      if (!email || !fullName || !password) return settle(fail("All fields are required."));
      if (db.users.some((u) => u.email.toLowerCase() === email)) return settle(fail("An account with that email already exists."));
      const user = { id: uid(), email, password, fullName: fullName.trim(), status: "pending", emailVerified: false, platformRole: "user" };
      db.users.push(user); saveDb(db);
      return settle({ ok: true, verifyToken: user.id }); // mock token = user id
    },

    async verifyEmail(token) {
      const db = loadDb();
      const u = userById(db, token) || db.users.find((x) => x.email.toLowerCase() === String(token).toLowerCase());
      if (!u) return settle(fail("Invalid verification link."));
      u.emailVerified = true; saveDb(db);
      return settle({ ok: true });
    },

    async login(email, password) {
      const db = loadDb();
      const u = db.users.find((x) => x.email.toLowerCase() === String(email).trim().toLowerCase());
      if (!u || u.password !== password) return settle(fail("Invalid email or password."));
      if (u.status === "inactive") return settle(fail("This account is deactivated."));
      writeSession(u); // logs in even if pending, so they can see "awaiting approval"
      return settle({ user: publicUser(db, u), status: u.status, emailVerified: u.emailVerified });
    },

    logout() { localStorage.removeItem(SESSION_KEY); },
    session() { return readSession(); },
    isAuthenticated() { return !!readSession(); },

    async me() {
      const db = loadDb(); const s = sess();
      if (!s) return settle(fail("Not signed in."));
      const u = userById(db, s.sub);
      return settle({
        user: publicUser(db, u),
        platformRole: u.platformRole,
        status: u.status,
        apps: appsForUser(db, u.id)
      });
    },

    // Mint a company-scoped access token for one app (what other apps call).
    async appToken(app, companyId) {
      const db = loadDb(); const s = sess();
      if (!s) return settle(fail("Not signed in."));
      const u = userById(db, s.sub);
      if (u.status !== "active") return settle(fail("Account not active."));
      if (!db.apps.some((a) => a.id === app)) return settle(fail("Unknown app."));
      const isSuperUser = u.platformRole === "superadmin";
      const e = entOf(db, u.id, app);
      const acc = db.access.find((a) => a.userId === u.id && a.appId === app && a.companyId === companyId);
      if (!isSuperUser) {
        if (!e) return settle(fail("Not entitled to this app."));
        if (!acc) return settle(fail("No access to this company for this app."));
      } else if (!db.companies.some((c) => c.id === companyId)) {
        return settle(fail("Unknown company."));
      }
      const level = isSuperUser ? "admin" : acc.level;
      const canDelete = isSuperUser || (e && e.canApproveDeletions);
      const userRole = isSuperUser ? "SUPERADMIN" : (level === "admin" ? "ADMIN" : "MEMBER");
      return settle({
        userId: u.id, email: u.email, name: u.fullName,
        app, companyId, selectedCompanyId: companyId,
        platformRole: u.platformRole, level,
        isAppAdmin: isSuperUser || (e && e.isAppAdmin), canApproveDeletions: canDelete,
        userRole, tokenType: "access"
      });
    },

    // Build a launch token string for opening an app at an external URL.
    // MOCK: an unsigned JWT the target app can decode for exp/identity. (Backend
    // signature validation needs the LIVE iam-service's signed token instead.)
    async appAccessToken(app, companyId) {
      const claims = await this.appToken(app, companyId);
      const b64 = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const header = b64({ alg: "HS256", typ: "JWT" });
      const payload = b64({ ...claims, exp: Math.floor(Date.now() / 1000) + 3600 });
      return header + "." + payload + ".dev";
    },

    // ---- Portal capability checks ---------------------------------------
    isSuperAdmin() { return isSuper(sess()); },
    isPortalAdmin() { return isPortalAdmin(sess()); },
    // Anyone who can open the portal at all (super, portal admin, or any app admin).
    canUsePortal() {
      const db = loadDb(); const s = sess();
      return isPortalAdmin(s) || appsIAdmin(db, s).length > 0;
    },
    appsIAdminister() { return appsIAdmin(loadDb(), sess()); },

    // ---- ADMIN: accounts (SWAP: /api/v1/admin/*) ------------------------
    async listUsers(filter) {
      const db = loadDb(); const s = sess();
      if (!this.canUsePortal()) return settle(fail("Admin access required."));
      let users = db.users.map((u) => publicUser(db, u));
      if (filter && filter.status) users = users.filter((u) => u.status === filter.status);
      if (filter && filter.q) {
        const q = String(filter.q).toLowerCase();
        users = users.filter((u) => (u.fullName + " " + u.email).toLowerCase().includes(q));
      }
      return settle(users);
    },

    async createUser({ email, fullName, password, platformRole }) {
      const db = loadDb(); const s = sess();
      if (!isPortalAdmin(s)) return settle(fail("Admin access required."));
      email = String(email || "").trim().toLowerCase();
      fullName = String(fullName || "").trim();
      platformRole = platformRole || "user";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return settle(fail("A valid email is required."));
      if (!fullName) return settle(fail("Full name is required."));
      if (String(password || "").length < 6) return settle(fail("Password must be at least 6 characters."));
      if (platformRole !== "user" && !isSuper(s)) return settle(fail("Only a Super Admin can create admin accounts."));
      if (db.users.some((u) => u.email === email)) return settle(fail("An account with that email already exists."));
      const u = { id: uid(), email, password, fullName, status: "active", emailVerified: true, platformRole };
      db.users.push(u); pushAudit(db, s, "create_user", u.id, { email, platformRole }); saveDb(db);
      return settle(publicUser(db, u));
    },
    async updateUser(userId, patch) {
      const db = loadDb(); const s = sess();
      if (!isPortalAdmin(s)) return settle(fail("Admin access required."));
      const u = userById(db, userId); if (!u) return settle(fail("User not found."));
      if (patch && patch.fullName != null) { if (!String(patch.fullName).trim()) return settle(fail("Full name cannot be empty.")); u.fullName = String(patch.fullName).trim(); }
      if (patch && patch.email != null) {
        const email = String(patch.email).trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return settle(fail("A valid email is required."));
        if (db.users.some((x) => x.email === email && x.id !== u.id)) return settle(fail("Another account already uses that email."));
        u.email = email;
      }
      pushAudit(db, s, "edit_user", u.id, patch); saveDb(db);
      return settle(publicUser(db, u));
    },
    async resetPassword(userId, password) {
      const db = loadDb(); const s = sess();
      if (!isPortalAdmin(s)) return settle(fail("Admin access required."));
      const u = userById(db, userId); if (!u) return settle(fail("User not found."));
      if (String(password || "").length < 6) return settle(fail("Password must be at least 6 characters."));
      u.password = password; pushAudit(db, s, "reset_password", u.id, null); saveDb(db);
      return settle({ ok: true });
    },
    async listAudit(limit) {
      const db = loadDb(); const s = sess();
      if (!isPortalAdmin(s)) return settle(fail("Admin access required."));
      return settle((db.audit || []).slice(0, limit || 100));
    },

    async approveAccount(userId) {
      const db = loadDb(); const s = sess();
      if (!isPortalAdmin(s)) return settle(fail("Only a Super Admin or Portal Admin can approve accounts."));
      const u = userById(db, userId); if (!u) return settle(fail("User not found."));
      u.status = "active"; saveDb(db);
      return settle(publicUser(db, u));
    },
    async setUserStatus(userId, status) {
      const db = loadDb(); const s = sess();
      if (!isPortalAdmin(s)) return settle(fail("Not authorized."));
      const u = userById(db, userId); if (!u) return settle(fail("User not found."));
      u.status = status; saveDb(db);
      return settle(publicUser(db, u));
    },
    async setPlatformRole(userId, role) {
      const db = loadDb(); const s = sess();
      if (!isSuper(s)) return settle(fail("Only a Super Admin can change platform roles."));
      if (!["superadmin", "admin", "user"].includes(role)) return settle(fail("Invalid role."));
      const u = userById(db, userId); if (!u) return settle(fail("User not found."));
      if (u.id === s.sub && role !== "superadmin") return settle(fail("You cannot remove your own Super Admin rights."));
      if (u.platformRole === "superadmin" && role !== "superadmin" && db.users.filter((x) => x.platformRole === "superadmin").length <= 1)
        return settle(fail("At least one Super Admin is required."));
      u.platformRole = role; saveDb(db);
      return settle(publicUser(db, u));
    },

    async listCompanies() {
      const db = loadDb();
      if (!this.canUsePortal()) return settle(fail("Admin access required."));
      return settle(db.companies);
    },
    async createCompany(name) {
      const db = loadDb(); const s = sess();
      if (!isPortalAdmin(s)) return settle(fail("Only a Super Admin or Portal Admin can create companies."));
      const c = { id: uid(), name: name.trim(), slug: name.trim().toLowerCase().replace(/\s+/g, "-"), status: "active" };
      db.companies.push(c); saveDb(db);
      return settle(c);
    },
    async listApps() { return settle(loadDb().apps); },

    // ---- ADMIN: per-app company setup (super admin / portal admin) -------
    // Which companies each app's switcher links to. listAppCompanies returns the
    // active companies set up for an app; appCompanyLinks returns the raw matrix.
    async listAppCompanies(appId) { return settle(companiesForApp(loadDb(), appId)); },
    async appCompanyLinks() {
      const db = loadDb();
      if (!this.canUsePortal()) return settle(fail("Admin access required."));
      return settle(db.appCompanies.map((ac) => ({ appId: ac.appId, companyId: ac.companyId })));
    },
    async setAppCompany(appId, companyId, enabled) {
      const db = loadDb(); const s = sess();
      if (!isPortalAdmin(s)) return settle(fail("Only a Super Admin or Portal Admin can set up companies for an app."));
      if (!db.apps.some((a) => a.id === appId)) return settle(fail("Unknown app."));
      if (!db.companies.some((c) => c.id === companyId)) return settle(fail("Unknown company."));
      const has = appHasCompany(db, appId, companyId);
      if (enabled && !has) db.appCompanies.push({ appId, companyId });
      if (!enabled && has) {
        db.appCompanies = db.appCompanies.filter((ac) => !(ac.appId === appId && ac.companyId === companyId));
        // Remove now-orphaned per-user access for this app+company.
        db.access = db.access.filter((a) => !(a.appId === appId && a.companyId === companyId));
      }
      saveDb(db);
      return settle({ ok: true });
    },

    // ---- ADMIN: entitlements (Stage 2) ----------------------------------
    // Assigning WHICH APPS a user may use: super admin OR portal admin.
    // Setting the elevated flags (is_app_admin / can_approve_deletions): super admin only.
    async setEntitlement(userId, appId, { entitled, isAppAdmin, canApproveDeletions }) {
      const db = loadDb(); const s = sess();
      if (!isPortalAdmin(s)) return settle(fail("Only an admin can assign apps."));
      if (!db.apps.some((a) => a.id === appId)) return settle(fail("Unknown app."));
      const settingFlags = (typeof isAppAdmin === "boolean") || (typeof canApproveDeletions === "boolean");
      if (settingFlags && !isSuper(s)) return settle(fail("Only a Super Admin can set app-admin or deletion-approval rights."));
      let e = entOf(db, userId, appId);
      if (entitled === false) {
        if (e) {
          db.entitlements = db.entitlements.filter((x) => x.id !== e.id);
          db.access = db.access.filter((a) => !(a.userId === userId && a.appId === appId)); // revoke company access too
        }
        saveDb(db);
        return settle({ ok: true });
      }
      if (!e) { e = { id: uid(), userId, appId, isAppAdmin: false, canApproveDeletions: false }; db.entitlements.push(e); }
      if (typeof isAppAdmin === "boolean") e.isAppAdmin = isAppAdmin;
      if (typeof canApproveDeletions === "boolean") e.canApproveDeletions = canApproveDeletions;
      saveDb(db);
      return settle({ ok: true });
    },

    // ---- ADMIN: company access (Stage 3 — APP ADMIN of that app) ---------
    async setCompanyAccess(userId, appId, companyId, level) {
      const db = loadDb(); const s = sess();
      if (!isAppAdminFor(db, s, appId)) return settle(fail("You are not an admin of this app."));
      if (!entOf(db, userId, appId)) return settle(fail("User is not entitled to this app — a Super Admin must assign the app first."));
      if (!appHasCompany(db, appId, companyId)) return settle(fail("That company is not set up for this app."));
      if (!LEVELS.includes(level)) return settle(fail("Invalid level."));
      let a = db.access.find((x) => x.userId === userId && x.appId === appId && x.companyId === companyId);
      if (!a) { a = { id: uid(), userId, appId, companyId, level }; db.access.push(a); }
      else a.level = level;
      saveDb(db);
      return settle({ ok: true });
    },
    async removeCompanyAccess(userId, appId, companyId) {
      const db = loadDb(); const s = sess();
      if (!isAppAdminFor(db, s, appId)) return settle(fail("You are not an admin of this app."));
      db.access = db.access.filter((x) => !(x.userId === userId && x.appId === appId && x.companyId === companyId));
      saveDb(db);
      return settle({ ok: true });
    },

    _reset() { localStorage.removeItem(DB_KEY); localStorage.removeItem(SESSION_KEY); }
  };

  // Bind the mock only when no live backend is configured (see iam-config.js).
  if (!(window.IAM_CONFIG && window.IAM_CONFIG.apiBase)) window.IAM = IAM;
})();
