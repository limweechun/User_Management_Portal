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

  // Global role catalog (mirrors iam-service/src/constants/roles.ts). The portal
  // assigns roles; platformRole/level/userRole are DERIVED for back-compat.
  // Collapsed 8 -> 5 (mirrors iam-service Phase A). The retired generic tiers
  // (Technician / Supervisor / Executive / Manager) folded into Ordinary User;
  // seniority for approvals now comes from the per-app role title's ladder tier.
  const GLOBAL_ROLES = [
    { name: "NEW_USER", label: "New User", rank: 0, description: "Newly added account awaiting a role assignment.", isSystem: true },
    { name: "ORDINARY_USER", label: "Ordinary User", rank: 1, description: "Standard signed-in user. Platform access is view-only by default; real capability comes from the per-app role assigned per company.", isSystem: true },
    { name: "DIRECTOR", label: "Director", rank: 2, description: "Senior management. Broad write access including financial visibility.", isSystem: true },
    { name: "ADMIN", label: "Admin", rank: 3, description: "Administers the portal and apps. Broad authority, but cannot manage Super Admins.", isSystem: true },
    { name: "SUPERADMIN", label: "Super Admin", rank: 4, description: "Full control across the platform and every app.", isSystem: true }
  ];
  const GLOBAL_ROLE_NAMES = GLOBAL_ROLES.map((r) => r.name);
  const roleToPlatformRole = (r) => (r === "SUPERADMIN" ? "superadmin" : r === "ADMIN" ? "admin" : "user");
  const roleToLevel = (r) => ((r === "SUPERADMIN" || r === "ADMIN") ? "admin" : (r === "DIRECTOR") ? "edit" : "view");
  const roleToUserRole = (r) => (r === "SUPERADMIN" ? "SUPERADMIN" : r === "ADMIN" ? "ADMIN" : "MEMBER");
  const levelToRole = (l) => (l === "admin" ? "ADMIN" : "ORDINARY_USER"); // edit/view -> ORDINARY_USER (MANAGER/TECHNICIAN retired)
  const platformRoleToRole = (p) => (p === "superadmin" ? "SUPERADMIN" : p === "admin" ? "ADMIN" : "NEW_USER");

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
    // globalRole is the source of truth; platformRole is derived from it.
    const users = [
      { id: "u-super",  email: "super@liziz.com",   password: "super123",   fullName: "Super Admin",   status: "active",  emailVerified: true,  globalRole: "SUPERADMIN", platformRole: "superadmin" },
      { id: "u-portal", email: "portal@liziz.com",  password: "portal123",  fullName: "Portal Admin",  status: "active",  emailVerified: true,  globalRole: "ADMIN", platformRole: "admin" },
      { id: "u-hradm",  email: "hradmin@liziz.com", password: "hradmin123", fullName: "Hana (HR Admin)", status: "active", emailVerified: true, globalRole: "ORDINARY_USER", platformRole: "user" },
      { id: "u-jane",   email: "jane@liziz.com",    password: "jane123",    fullName: "Jane Doe",      status: "active",  emailVerified: true,  globalRole: "ORDINARY_USER", platformRole: "user" },
      { id: "u-bob",    email: "bob@acme.com",      password: "bob123",     fullName: "Bob Tan",       status: "active",  emailVerified: true,  globalRole: "ORDINARY_USER", platformRole: "user" },
      { id: "u-pending",email: "newbie@liziz.com",  password: "newbie123",  fullName: "Newbie Lim",    status: "pending", emailVerified: false, globalRole: "NEW_USER", platformRole: "user" }
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
    // role is the source of truth; level is derived from it.
    const mkAccess = (userId, appId, companyId, role) => ({ id: uid(), userId, appId, companyId, role, level: roleToLevel(role) });
    const access = [
      mkAccess("u-hradm", "hr", "c-liziz", "ADMIN"),
      mkAccess("u-jane", "hr", "c-liziz", "MANAGER"),
      mkAccess("u-jane", "psm", "c-acme", "TECHNICIAN"),
      mkAccess("u-bob", "procurement", "c-acme", "MANAGER"),
      mkAccess("u-jane", "rnd", "c-liziz", "ADMIN"),
      mkAccess("u-hradm", "rnd", "c-liziz", "TECHNICIAN")
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
      platformRole: user.platformRole, globalRole: user.globalRole || platformRoleToRole(user.platformRole), status: user.status,
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
            .map((c) => ({ companyId: c.id, name: c.name, role: "SUPERADMIN", level: "admin" }))
        };
      });
      return out;
    }
    db.entitlements.filter((e) => e.userId === userId).forEach((e) => {
      const companies = db.access
        .filter((a) => a.userId === userId && a.appId === e.appId)
        .map((a) => {
          const role = a.role || levelToRole(a.level);
          return { companyId: a.companyId, name: companyName(db, a.companyId), role, level: a.level || roleToLevel(role) };
        });
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
      id: u.id, email: u.email, userCode: u.userCode || null, fullName: u.fullName, status: u.status,
      phone: u.phone || null,
      notifyInApp: u.notifyInApp !== false, notifyEmail: u.notifyEmail !== false,
      emailVerified: u.emailVerified,
      globalRole: u.globalRole || platformRoleToRole(u.platformRole),
      platformRole: u.platformRole,
      entitlements: db.entitlements.filter((e) => e.userId === u.id).map((e) => ({
        appId: e.appId, appName: (db.apps.find((a) => a.id === e.appId) || {}).name,
        isAppAdmin: e.isAppAdmin, canApproveDeletions: e.canApproveDeletions,
        companies: db.access.filter((a) => a.userId === u.id && a.appId === e.appId)
          .map((a) => ({ companyId: a.companyId, name: companyName(db, a.companyId), role: a.role || levelToRole(a.level), level: a.level }))
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
    APP_IDS, LEVELS, ROLES: GLOBAL_ROLES,
    LEVEL_LABEL: { view: "View", edit: "Edit", admin: "Admin" },

    // ---- AUTH (SWAP: fetch /api/v1/auth/*) -------------------------------
    async register({ email, fullName, password }) {
      const db = loadDb();
      email = String(email || "").trim().toLowerCase();
      if (!email || !fullName || !password) return settle(fail("All fields are required."));
      if (db.users.some((u) => u.email.toLowerCase() === email)) return settle(fail("An account with that email already exists."));
      // New users land ACTIVE with the default role and NO apps (admin grants access later).
      const user = { id: uid(), email, password, fullName: fullName.trim(), status: "active", emailVerified: false, globalRole: "NEW_USER", platformRole: "user" };
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

    async login(email, password, _rememberMe) {
      const db = loadDb();
      const u = db.users.find((x) => x.email.toLowerCase() === String(email).trim().toLowerCase());
      if (!u || u.password !== password) return settle(fail("Invalid email or password."));
      if (u.status === "inactive") return settle(fail("This account is deactivated."));
      if (!u.emailVerified) return settle(fail("Please verify your email before signing in."));
      writeSession(u); // mock has no persistent cookie, so rememberMe is a no-op here
      return settle({ user: publicUser(db, u), status: u.status, emailVerified: u.emailVerified });
    },

    // Public account recovery (SWAP: POST /auth/forgot-password, /auth/reset-password).
    async forgotPassword(email) {
      const db = loadDb();
      email = String(email || "").trim().toLowerCase();
      const u = db.users.find((x) => x.email.toLowerCase() === email);
      // Respond the same way whether or not the account exists (no enumeration).
      const generic = { ok: true, message: "If an account exists for that email, a password reset link has been sent." };
      if (!u || u.status === "inactive") return settle(generic);
      return settle({ ...generic, devResetLink: location.pathname + "?reset=" + u.id }); // mock token = user id
    },
    async resetPasswordWithToken(token, password) {
      const db = loadDb();
      const u = userById(db, token);
      if (!u) return settle(fail("This reset link is invalid or has expired."));
      if (!password || String(password).length < 6) return settle(fail("Password must be at least 6 characters."));
      u.password = password; u.emailVerified = true; saveDb(db);
      return settle({ ok: true });
    },
    async getBranding() {
      const db = loadDb();
      const b = (db.settings && db.settings.login_branding) || {};
      return settle({ companyName: b.companyName || "", message: b.message || "", photoDataUrl: b.photoDataUrl || "", logoDataUrl: b.logoDataUrl || "", shortLogoDataUrl: b.shortLogoDataUrl || "", photoDataUrls: Array.isArray(b.photoDataUrls) ? b.photoDataUrls : [] });
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
        globalRole: u.globalRole || platformRoleToRole(u.platformRole),
        roles: GLOBAL_ROLES.slice(),
        status: u.status,
        apps: appsForUser(db, u.id)
      });
    },

    // Self-service: update own profile / notification prefs.
    async updateProfile(patch) {
      const db = loadDb(); const s = sess();
      if (!s) return settle(fail("Not signed in."));
      const u = userById(db, s.sub);
      if (u.status !== "active") return settle(fail("Account not active."));
      const p = patch || {};
      if (p.fullName != null) { const v = String(p.fullName).trim(); if (!v) return settle(fail("Name cannot be empty.")); u.fullName = v; }
      if (p.phone != null) u.phone = String(p.phone).trim() || null;
      if (p.notifyInApp != null) u.notifyInApp = !!p.notifyInApp;
      if (p.notifyEmail != null) u.notifyEmail = !!p.notifyEmail;
      saveDb(db);
      return settle({ user: publicUser(db, u) });
    },

    // Self-service: change own password.
    async changePassword(currentPassword, newPassword) {
      const db = loadDb(); const s = sess();
      if (!s) return settle(fail("Not signed in."));
      const u = userById(db, s.sub);
      if (String(newPassword || "").length < 6) return settle(fail("New password must be at least 6 characters."));
      if (u.password !== String(currentPassword || "")) return settle(fail("Current password is incorrect."));
      u.password = String(newPassword); saveDb(db);
      return settle({ ok: true });
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
      // role is the source of truth; level/userRole are derived for back-compat.
      const role = isSuperUser ? "SUPERADMIN" : (acc.role || levelToRole(acc.level));
      const level = roleToLevel(role);
      const canDelete = isSuperUser || (e && e.canApproveDeletions);
      const userRole = roleToUserRole(role);
      // Full per-app company list (role + derived level) so a handoff app (PSM) can reconcile.
      const companies = (appsForUser(db, u.id)[app] || {}).companies || [];
      return settle({
        userId: u.id, email: u.email, name: u.fullName,
        app, companyId, selectedCompanyId: companyId,
        platformRole: u.platformRole, level,
        isAppAdmin: isSuperUser || (e && e.isAppAdmin), canApproveDeletions: canDelete,
        userRole, companies, tokenType: "access"
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
    globalRoles() { return GLOBAL_ROLES.slice().sort((a, b) => a.rank - b.rank); },
    globalRole() { const s = sess(); if (!s) return null; const u = userById(loadDb(), s.sub); return u ? (u.globalRole || platformRoleToRole(u.platformRole)) : null; },
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

    async createUser({ email, fullName, password, globalRole, platformRole, phone }) {
      const db = loadDb(); const s = sess();
      if (!isPortalAdmin(s)) return settle(fail("Admin access required."));
      email = String(email || "").trim().toLowerCase();
      fullName = String(fullName || "").trim();
      // globalRole is the source of truth; platformRole is derived from it.
      const role = globalRole ? String(globalRole).toUpperCase() : platformRoleToRole(platformRole || "user");
      if (!GLOBAL_ROLE_NAMES.includes(role)) return settle(fail("Invalid role."));
      const derivedPlatformRole = roleToPlatformRole(role);
      phone = String(phone || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return settle(fail("A valid email is required."));
      if (!fullName) return settle(fail("Full name is required."));
      if (String(password || "").length < 6) return settle(fail("Password must be at least 6 characters."));
      if (derivedPlatformRole !== "user" && !isSuper(s)) return settle(fail("Only a Super Admin can create admin accounts."));
      if (db.users.some((u) => u.email === email)) return settle(fail("An account with that email already exists."));
      const u = { id: uid(), email, password, fullName, phone: phone || null, status: "active", emailVerified: true, globalRole: role, platformRole: derivedPlatformRole };
      db.users.push(u); pushAudit(db, s, "create_user", u.id, { email, globalRole: role }); saveDb(db);
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
    async listAudit(p) {
      p = p || {}; const db = loadDb(); const s = sess();
      if (!isPortalAdmin(s)) return settle(fail("Admin access required."));
      let rows = (db.audit || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      if (p.action && p.action !== "all") rows = rows.filter((r) => r.action === p.action);
      if (p.appId && p.appId !== "all") rows = rows.filter((r) => r.appId === p.appId);
      if (p.q) { const q = String(p.q).toLowerCase(); rows = rows.filter((r) => JSON.stringify(r).toLowerCase().indexOf(q) >= 0); }
      const actions = Array.from(new Set((db.audit || []).map((r) => r.action))).sort();
      const off = p.offset || 0, lim = p.limit || 100;
      return settle({ items: rows.slice(off, off + lim), total: rows.length, actions });
    },
    async loadSettings() {
      const db = loadDb();
      if (!this.canUsePortal()) return settle(fail("Admin access required."));
      return settle(db.settings || {});
    },
    async getEmailConfig() {
      const db = loadDb(); const s = sess();
      if (!isPortalAdmin(s)) return settle(fail("Admin access required."));
      const c = (db.settings && db.settings.emailConfig) || {};
      return settle({ enabled: !!c.enabled, host: c.host || "", port: c.port || 587, secure: !!c.secure, user: c.user || "", password: "", hasPassword: !!c.password, fromName: c.fromName || "", fromEmail: c.fromEmail || "" });
    },
    async saveEmailConfig(cfg) {
      const db = loadDb(); const s = sess();
      if (!isPortalAdmin(s)) return settle(fail("Admin access required."));
      db.settings = db.settings || {};
      const prev = db.settings.emailConfig || {};
      const pw = String((cfg && cfg.password) || "");
      db.settings.emailConfig = {
        enabled: !!(cfg && cfg.enabled), host: (cfg && cfg.host) || "", port: Number(cfg && cfg.port) || 587, secure: !!(cfg && cfg.secure),
        user: (cfg && cfg.user) || "", password: pw.length ? pw : (prev.password || ""), fromName: (cfg && cfg.fromName) || "", fromEmail: (cfg && cfg.fromEmail) || ""
      };
      saveDb(db);
      return settle({ ok: true });
    },
    async testEmail() {
      const s = sess();
      if (!isPortalAdmin(s)) return settle(fail("Admin access required."));
      return settle(fail("Test email needs the live backend (mock mode can't send mail)."));
    },
    async submitFeedback({ app, category, rating, message }) {
      const db = loadDb(); const s = sess();
      if (!s) return settle(fail("Not signed in."));
      const u = userById(db, s.sub) || {};
      db.feedback = db.feedback || [];
      db.feedback.unshift({ id: uid(), appId: app || "unknown", userId: s.sub, email: u.email, name: u.fullName, category: category || "general", rating: rating || null, message: message || "", status: "new", createdAt: new Date().toISOString() });
      saveDb(db);
      return settle({ ok: true });
    },
    async listFeedback(filter) {
      const db = loadDb();
      if (!this.canUsePortal()) return settle(fail("Admin access required."));
      let list = (db.feedback || []).slice();
      const f = filter || {};
      if (f.app && f.app !== "all") list = list.filter((x) => x.appId === f.app);
      if (f.status && f.status !== "all") list = list.filter((x) => x.status === f.status);
      if (f.q) { const q = String(f.q).toLowerCase(); list = list.filter((x) => ((x.message || "") + " " + (x.name || "") + " " + (x.email || "")).toLowerCase().includes(q)); }
      return settle(list);
    },
    async setFeedbackStatus(id, status) {
      const db = loadDb(); const s = sess();
      if (!isPortalAdmin(s)) return settle(fail("Admin access required."));
      const fb = (db.feedback || []).find((x) => x.id === id); if (!fb) return settle(fail("Not found."));
      fb.status = status; saveDb(db);
      return settle({ ok: true });
    },
    async saveSetting(key, value) {
      const db = loadDb(); const s = sess();
      if (!isPortalAdmin(s)) return settle(fail("Admin access required."));
      db.settings = db.settings || {};
      db.settings[key] = value; saveDb(db);
      return settle({ ok: true });
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
      u.platformRole = role; u.globalRole = platformRoleToRole(role); saveDb(db);
      return settle(publicUser(db, u));
    },
    // Set a user's global (catalog) role — the source of truth; platformRole derived.
    async setGlobalRole(userId, role) {
      const db = loadDb(); const s = sess();
      if (!isSuper(s)) return settle(fail("Only a Super Admin can change roles."));
      role = String(role || "").toUpperCase();
      if (!GLOBAL_ROLE_NAMES.includes(role)) return settle(fail("Invalid role."));
      const u = userById(db, userId); if (!u) return settle(fail("User not found."));
      const platformRole = roleToPlatformRole(role);
      if (u.id === s.sub && platformRole !== "superadmin") return settle(fail("You cannot remove your own Super Admin rights."));
      if (u.platformRole === "superadmin" && platformRole !== "superadmin" && db.users.filter((x) => x.platformRole === "superadmin").length <= 1)
        return settle(fail("At least one Super Admin is required."));
      u.globalRole = role; u.platformRole = platformRole; saveDb(db);
      return settle(publicUser(db, u));
    },

    async listCompanies() {
      const db = loadDb();
      if (!this.canUsePortal()) return settle(fail("Admin access required."));
      // Per-company active/inactive user counts (dedupe users across apps).
      const statusOf = Object.fromEntries(db.users.map((u) => [u.id, u.status]));
      const seen = {}, act = {}, inact = {};
      (db.access || []).forEach((a) => {
        seen[a.companyId] = seen[a.companyId] || {};
        if (seen[a.companyId][a.userId]) return;
        seen[a.companyId][a.userId] = 1;
        if (statusOf[a.userId] === "active") act[a.companyId] = (act[a.companyId] || 0) + 1;
        else if (statusOf[a.userId] === "inactive") inact[a.companyId] = (inact[a.companyId] || 0) + 1;
      });
      return settle(db.companies.map((c) => ({ ...c, activeUsers: act[c.id] || 0, inactiveUsers: inact[c.id] || 0 })));
    },
    async createCompany(data) {
      const db = loadDb(); const s = sess();
      if (!isPortalAdmin(s)) return settle(fail("Only a Super Admin or Portal Admin can create companies."));
      const d = typeof data === "string" ? { name: data } : (data || {});
      const name = String(d.name || "").trim();
      if (!name) return settle(fail("Company name is required."));
      const slug = name.toLowerCase().replace(/\s+/g, "-");
      if (db.companies.some((c) => c.slug === slug)) return settle(fail("A company with that name exists."));
      const email = String(d.email || "").trim();
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return settle(fail("A valid contact email is required."));
      const c = { id: uid(), name, slug, status: "active", regNo: String(d.regNo || "").trim() || null, address: String(d.address || "").trim() || null, email: email || null, phone: String(d.phone || "").trim() || null };
      db.companies.push(c); saveDb(db);
      return settle(c);
    },
    async updateCompany(id, patch) {
      const db = loadDb(); const s = sess();
      if (!isPortalAdmin(s)) return settle(fail("Admin access required."));
      const c = db.companies.find((x) => x.id === id); if (!c) return settle(fail("Company not found."));
      const p = patch || {};
      if (p.name != null) { const name = String(p.name).trim(); if (!name) return settle(fail("Company name is required.")); const slug = name.toLowerCase().replace(/\s+/g, "-"); if (db.companies.some((x) => x.slug === slug && x.id !== id)) return settle(fail("A company with that name exists.")); c.name = name; c.slug = slug; }
      if (p.regNo != null) c.regNo = String(p.regNo).trim() || null;
      if (p.address != null) c.address = String(p.address).trim() || null;
      if (p.email != null) { const email = String(p.email).trim(); if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return settle(fail("A valid contact email is required.")); c.email = email || null; }
      if (p.phone != null) c.phone = String(p.phone).trim() || null;
      if (p.status != null) { const st = String(p.status); if (!["active", "inactive"].includes(st)) return settle(fail("Invalid status.")); c.status = st; }
      saveDb(db);
      return settle(c);
    },
    async listApps() { return settle(loadDb().apps); },
    async createApp({ id, name, shortName, icon, url, active }) {
      const db = loadDb(); const s = sess();
      if (!isPortalAdmin(s)) return settle(fail("Admin access required."));
      id = String(id || "").trim().toLowerCase();
      if (!/^[a-z]{1,6}[0-9]{2}$/.test(id)) return settle(fail("App ID must be word initials + a 2-digit series number, e.g. tcbpp01."));
      if (!String(name || "").trim()) return settle(fail("App name is required."));
      if (db.apps.some((a) => a.id === id)) return settle(fail("An app with that ID already exists."));
      const app = { id, name: name.trim(), shortName: (shortName || "").trim() || null, icon: (icon || "box").trim(), url: (url || "").trim(), active: active == null ? true : !!active };
      db.apps.push(app); saveDb(db);
      return settle(app);
    },
    async updateApp(id, patch) {
      const db = loadDb(); const s = sess();
      if (!isPortalAdmin(s)) return settle(fail("Admin access required."));
      const app = db.apps.find((a) => a.id === id); if (!app) return settle(fail("App not found."));
      if (patch.name != null) { if (!String(patch.name).trim()) return settle(fail("App name cannot be empty.")); app.name = patch.name.trim(); }
      if (patch.shortName != null) app.shortName = String(patch.shortName).trim() || null;
      if (patch.icon != null) app.icon = String(patch.icon).trim() || "box";
      if (patch.url != null) app.url = String(patch.url).trim();
      if (patch.active != null) app.active = !!patch.active;
      saveDb(db);
      return settle(app);
    },
    // Per-app maintenance mode — Super Admin only.
    async setAppMaintenance(id, maintenanceMode, maintenanceMessage) {
      const db = loadDb(); const s = sess();
      if (!isSuper(s)) return settle(fail("Only a Super Admin can change maintenance mode."));
      const app = db.apps.find((a) => a.id === id); if (!app) return settle(fail("App not found."));
      app.maintenanceMode = !!maintenanceMode;
      app.maintenanceMessage = maintenanceMessage || null;
      saveDb(db);
      return settle(app);
    },

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
    async setCompanyAccess(userId, appId, companyId, role) {
      const db = loadDb(); const s = sess();
      if (!isAppAdminFor(db, s, appId)) return settle(fail("You are not an admin of this app."));
      if (!entOf(db, userId, appId)) return settle(fail("User is not entitled to this app — a Super Admin must assign the app first."));
      if (!appHasCompany(db, appId, companyId)) return settle(fail("That company is not set up for this app."));
      role = String(role || "").toUpperCase();
      if (!GLOBAL_ROLE_NAMES.includes(role)) return settle(fail("Invalid role."));
      const level = roleToLevel(role);
      let a = db.access.find((x) => x.userId === userId && x.appId === appId && x.companyId === companyId);
      if (!a) { a = { id: uid(), userId, appId, companyId, role, level }; db.access.push(a); }
      else { a.role = role; a.level = level; }
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
