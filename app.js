/* User Management Portal — UI logic (talks to window.IAM) */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const icons = () => window.lucide && window.lucide.createIcons();
  const initials = (n) => (n || "").trim().split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";

  let me = null;            // result of IAM.me()
  let apps = [];            // app catalog
  let companies = [];       // all companies
  let accountsStatus = "pending";
  let accountsQuery = "";   // free-text search on the accounts list
  let dragOffset = { x: 0, y: 0 };  // current modal drag offset
  let dragging = null;              // active drag session
  let currentApp = null;    // selected app in Company Access view

  function toast(msg, kind) {
    const t = $("toast");
    t.textContent = msg; t.className = "toast" + (kind ? " " + kind : ""); t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2400);
  }
  function hideAll() { ["loginScreen", "registerScreen", "awaitingScreen", "deniedScreen", "launcherScreen", "shell"].forEach((id) => ($(id).hidden = true)); }

  // SSO return: if an app sent the user here to sign in (?return=<appUrl>),
  // bounce them back once authenticated. Only http(s) allowed (avoid open redirect;
  // tighten to an app-URL allowlist for production).
  function returnTarget() {
    const p = new URLSearchParams(location.search).get("return");
    if (!p) return null;
    try {
      const u = new URL(p, location.origin);
      if (u.protocol === "http:" || u.protocol === "https:") return u.href;
    } catch (e) { /* ignore */ }
    return null;
  }

  async function init() {
    if (!window.IAM) { console.error("IAM client failed to load"); return; }
    // Auth state is resolved via /me (works for the mock and the live cookie-based API).
    try { me = await IAM.me(); }
    catch (e) { return showLogin(); }
    if (me.status === "pending") return showAwaiting();
    const ret = returnTarget();
    if (ret) return void location.replace(ret); // already signed in → straight back to the app
    return showLauncher();
  }

  async function routeAuthed() {
    me = await IAM.me();
    if (me.status === "pending") return showAwaiting();
    const ret = returnTarget();
    if (ret) return void location.replace(ret); // SSO: return to the app that sent us
    return showLauncher();   // otherwise the app launcher home
  }

  /* ---- App launcher (home) --------------------------------------------- */
  async function showLauncher() {
    hideAll();
    if (!apps.length) apps = await IAM.listApps();
    const catalog = Object.fromEntries(apps.map((a) => [a.id, a]));
    // Apps the user can actually open = entitled AND has >=1 company access.
    const granted = Object.entries(me.apps)
      .filter(([, info]) => info.companies && info.companies.length > 0)
      .map(([id]) => catalog[id]).filter(Boolean);

    // Apps that run their OWN backend session (not the shared cookie) need a
    // launch token handed to a specific callback route, even when same-origin.
    const HANDOFF_CALLBACK = { psm: "/psm/auth/callback" };

    // Mint a launch token when the app needs a handoff: external URL apps read
    // #token= at their root; HANDOFF_CALLBACK apps read it at their callback path.
    await Promise.all(granted.map(async (a) => {
      const needsToken = /^https?:\/\//.test(a.url || "") || HANDOFF_CALLBACK[a.id];
      if (needsToken) {
        try {
          const companyId = (me.apps[a.id].companies[0] || {}).companyId;
          if (companyId) a._token = await IAM.appAccessToken(a.id, companyId);
        } catch { /* leave untokened — app will redirect to the portal to sign in */ }
      }
    }));

    const tiles = granted.map((a) => {
      const callback = HANDOFF_CALLBACK[a.id];
      const href = a._token
        ? `${esc(callback || a.url)}#token=${a._token}`
        : esc(a.url || ("/" + a.id));
      return `
      <a class="tile" href="${href}">
        <span class="tile-icon"><i data-lucide="${esc(a.icon)}"></i></span>
        <strong>${esc(a.name)}</strong>
        <span class="tile-go">Open <i data-lucide="arrow-right"></i></span>
      </a>`;
    }).join("");
    const adminTile = IAM.canUsePortal() ? `
      <button class="tile tile-admin" id="tileAdmin" type="button">
        <span class="tile-icon"><i data-lucide="shield"></i></span>
        <strong>User Management</strong>
        <span class="tile-go">Manage <i data-lucide="arrow-right"></i></span>
      </button>` : "";

    $("launcherScreen").innerHTML = `
      <header class="launch-top">
        <div class="brand"><span class="brand-mark">WO</span><div><strong>Workplace Operations</strong><small>Choose an app</small></div></div>
        <div class="user-chip">
          <span class="avatar">${esc(initials(me.user.fullName))}</span>
          <span class="meta"><strong>${esc(me.user.fullName)}</strong><small>${esc(me.user.email)}</small></span>
          <button class="btn ghost icon" id="launchOut" type="button" aria-label="Sign out" title="Sign out"><i data-lucide="log-out"></i></button>
        </div>
      </header>
      <div class="launch-body">
        <h1>Your apps</h1>
        ${(granted.length || adminTile)
          ? `<div class="tiles">${tiles}${adminTile}</div>`
          : `<p class="muted">No apps have been assigned to your account yet. Please contact an administrator.</p>`}
      </div>`;
    $("launcherScreen").hidden = false;
    if ($("tileAdmin")) $("tileAdmin").onclick = () => bootPortal();
    $("launchOut").onclick = () => { IAM.logout(); showLogin(); };
    icons();
  }

  /* ---- Auth screens ----------------------------------------------------- */
  function showLogin() {
    hideAll(); $("loginScreen").hidden = false;
    const form = $("loginForm"), err = $("loginError");
    if (!form.dataset.bound) {
      form.dataset.bound = "1";
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); err.hidden = true;
        try { await IAM.login($("loginEmail").value, $("loginPass").value); routeAuthed(); }
        catch (ex) { err.textContent = ex.message; err.hidden = false; }
      });
      $("toRegister").addEventListener("click", (e) => { e.preventDefault(); showRegister(); });
    }
    icons(); $("loginEmail").focus();
  }

  function showRegister() {
    hideAll(); $("registerScreen").hidden = false;
    const form = $("registerForm"), err = $("regError");
    if (!form.dataset.bound) {
      form.dataset.bound = "1";
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); err.hidden = true;
        try {
          const r = await IAM.register({ email: $("regEmail").value, fullName: $("regName").value, password: $("regPass").value });
          await IAM.login($("regEmail").value, $("regPass").value);
          // immediately mark verified for the demo flow via the returned token
          await IAM.verifyEmail(r.verifyToken);
          routeAuthed();
        } catch (ex) { err.textContent = ex.message; err.hidden = false; }
      });
      $("toLogin").addEventListener("click", (e) => { e.preventDefault(); showLogin(); });
    }
    icons(); $("regName").focus();
  }

  function showAwaiting() {
    hideAll();
    const u = me.user;
    const verify = u.emailVerified
      ? `<p class="muted">Your email is verified. An administrator will approve your account shortly.</p>`
      : `<p class="muted">First, verify your email address.</p><button class="btn primary block" id="verifyBtn" type="button"><i data-lucide="mail-check"></i><span>Verify email</span></button>`;
    $("awaitingScreen").innerHTML = `<div class="card">
      <div class="brand"><span class="brand-mark">IAM</span><div><strong>Awaiting approval</strong><small>Account pending</small></div></div>
      <h1>Thanks, ${esc(u.fullName)}</h1>
      ${verify}
      <button class="btn ghost block" id="awaitOut" type="button" style="margin-top:10px"><i data-lucide="log-out"></i><span>Sign out</span></button>
    </div>`;
    $("awaitingScreen").hidden = false;
    if ($("verifyBtn")) $("verifyBtn").onclick = async () => { await IAM.verifyEmail(u.email); me = await IAM.me(); showAwaiting(); toast("Email verified."); };
    $("awaitOut").onclick = () => { IAM.logout(); showLogin(); };
    icons();
  }

  function showDenied() {
    hideAll();
    $("deniedScreen").innerHTML = `<div class="card">
      <div class="brand"><span class="brand-mark">IAM</span><div><strong>No portal access</strong><small>Admin Portal</small></div></div>
      <h1>Nothing to manage here</h1>
      <p class="muted">You're signed in as <strong>${esc(me.user.fullName)}</strong>, but this portal is for Super Admins, Portal Admins and App Admins. You can open the apps you've been granted from their own URLs.</p>
      <button class="btn primary block" id="denOut" type="button"><i data-lucide="log-out"></i><span>Sign out</span></button>
    </div>`;
    $("deniedScreen").hidden = false;
    $("denOut").onclick = () => { IAM.logout(); showLogin(); };
    icons();
  }

  /* ---- Portal shell ----------------------------------------------------- */
  async function bootPortal() {
    hideAll(); $("shell").hidden = false;
    apps = await IAM.listApps();
    companies = await IAM.listCompanies().catch(() => []);

    $("meAvatar").textContent = initials(me.user.fullName);
    $("meName").textContent = me.user.fullName;
    $("meEmail").textContent = me.user.email;
    $("meRoleBadge").textContent = me.platformRole === "superadmin" ? "Super Admin"
      : me.platformRole === "admin" ? "Portal Admin" : "App Admin";

    const canPortalAdmin = IAM.isPortalAdmin();
    const canSuper = IAM.isSuperAdmin();
    const myAdminApps = IAM.appsIAdminister();
    $("navAccounts").hidden = !canPortalAdmin;
    $("navAppsRoles").hidden = !canPortalAdmin;   // portal admins may assign apps too
    $("navCompanyAccess").hidden = myAdminApps.length === 0;
    $("navCompanies").hidden = !canPortalAdmin;
    $("navAudit").hidden = !canPortalAdmin;

    bindShell();
    const first = canPortalAdmin ? "accounts" : (canSuper ? "appsRoles" : "companyAccess");
    setView(first);
    icons();
  }

  function bindShell() {
    if (bindShell._done) return; bindShell._done = true;
    $("navLauncher").addEventListener("click", () => showLauncher());
    $("nav").addEventListener("click", (e) => {
      const item = e.target.closest("[data-view]"); if (!item || item.hidden) return;
      document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("is-active"));
      item.classList.add("is-active");
      setView(item.dataset.view);
    });
    $("signOutBtn").addEventListener("click", () => { IAM.logout(); showLogin(); });
    $("newCompanyBtn").addEventListener("click", onNewCompany);
    $("drawerClose").addEventListener("click", closeDrawer);
    // Close only via the ✕ button (or Escape) — NOT by clicking outside the
    // window, so a stray click (or releasing a drag outside) won't dismiss it.
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

    // Drag the modal from anywhere on its frame/edge/header. Uses Pointer Events
    // with pointer capture, so the drag keeps tracking even if the cursor moves
    // fast or leaves the window. Skips interactive controls (so inputs/buttons
    // still work) and the bottom-right resize corner (so native resize works).
    const drawerEl = $("drawer");
    drawerEl.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return; // left button only
      if (e.target.closest("input, textarea, select, button, a, label, .btn, #drawerClose")) return;
      const r = drawerEl.getBoundingClientRect();
      if (e.clientX > r.right - 22 && e.clientY > r.bottom - 22) return; // resize corner
      dragging = { sx: e.clientX, sy: e.clientY, ox: dragOffset.x, oy: dragOffset.y };
      try { drawerEl.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    drawerEl.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      dragOffset.x = dragging.ox + (e.clientX - dragging.sx);
      dragOffset.y = dragging.oy + (e.clientY - dragging.sy);
      drawerEl.style.transform = `translate(${dragOffset.x}px, ${dragOffset.y}px)`;
    });
    const endDrag = (e) => { if (!dragging) return; dragging = null; try { drawerEl.releasePointerCapture(e.pointerId); } catch (_) {} };
    drawerEl.addEventListener("pointerup", endDrag);
    drawerEl.addEventListener("pointercancel", endDrag);
    $("accountsFilter").addEventListener("click", (e) => {
      const b = e.target.closest("[data-status]"); if (!b) return;
      accountsStatus = b.dataset.status;
      [...$("accountsFilter").children].forEach((c) => c.classList.toggle("is-selected", c === b));
      renderAccounts();
    });
    // Debounced search over the accounts list.
    let searchTimer;
    $("accountsSearch").addEventListener("input", (e) => {
      accountsQuery = e.target.value.trim();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderAccounts, 250);
    });
    $("newUserBtn").addEventListener("click", openCreateUserDrawer);
  }

  const VIEW_META = {
    accounts: ["User Account", "Approve sign-ups and manage account status. (Super Admin / Portal Admin)"],
    appsRoles: ["Apps & Roles", "Assign which apps each user may use. (Super Admin / Portal Admin — making an app admin & deletion-approval rights are Super Admin only.)"],
    companyAccess: ["Company Access", "For an app you administer, assign which companies each entitled user can use, and at what level."],
    companies: ["Companies", "Organizations in the system."],
    audit: ["Audit Log", "Recent administrative actions across the platform (most recent first)."]
  };
  function setView(view) {
    ["accounts", "appsRoles", "companyAccess", "companies", "audit"].forEach((v) => ($(v + "View").hidden = v !== view));
    const nav = $("nav").querySelector(`[data-view="${view}"]`);
    document.querySelectorAll(".nav-item").forEach((n) => n.classList.toggle("is-active", n === nav));
    $("viewTitle").textContent = VIEW_META[view][0];
    $("viewSub").textContent = VIEW_META[view][1];
    $("viewTitle").focus();
    if (view === "accounts") renderAccounts();
    else if (view === "appsRoles") renderAppsRoles();
    else if (view === "companyAccess") renderCompanyAccess();
    else if (view === "audit") renderAudit();
    else renderCompanies();
  }

  /* ---- Accounts --------------------------------------------------------- */
  async function renderAccounts() {
    const canSuper = IAM.isSuperAdmin();
    let users;
    const filter = {};
    if (accountsStatus !== "all") filter.status = "pending";
    if (accountsQuery) filter.q = accountsQuery;
    try { users = await IAM.listUsers(filter); }
    catch (ex) { $("accountsTable").innerHTML = `<tbody><tr><td>${esc(ex.message)}</td></tr></tbody>`; return; }

    const roleCell = (u) => canSuper
      ? `<select class="select sm" data-role-user="${esc(u.id)}" aria-label="Platform role for ${esc(u.fullName)}">
           ${["user", "admin", "superadmin"].map((r) => `<option value="${r}" ${u.platformRole === r ? "selected" : ""}>${r === "superadmin" ? "Super Admin" : r === "admin" ? "Portal Admin" : "User"}</option>`).join("")}
         </select>`
      : `<span class="badge">${u.platformRole === "superadmin" ? "Super Admin" : u.platformRole === "admin" ? "Portal Admin" : "User"}</span>`;

    $("accountsTable").innerHTML = `<thead><tr><th>User</th><th>Status</th><th>Email</th><th>Platform role</th><th>Actions</th></tr></thead><tbody>${
      users.map((u) => `<tr>
        <th scope="row"><strong>${esc(u.fullName)}</strong><small>${esc(u.email)}</small></th>
        <td><span class="badge ${u.status === "active" ? "ok" : u.status === "pending" ? "warn" : "off"}">${u.status}</span></td>
        <td><span class="badge ${u.emailVerified ? "ok" : "off"}">${u.emailVerified ? "Verified" : "Unverified"}</span></td>
        <td>${roleCell(u)}</td>
        <td class="actions">
          ${u.status === "pending" ? `<button class="btn primary sm" data-approve="${esc(u.id)}">Approve</button>` : ""}
          <button class="btn ghost sm" data-edit-user="${esc(u.id)}">Edit</button>
          <button class="btn ghost sm" data-reset="${esc(u.id)}">Reset PW</button>
          ${u.status !== "pending" ? `<button class="btn ghost sm" data-toggle="${esc(u.id)}" data-status="${u.status}">${u.status === "active" ? "Deactivate" : "Activate"}</button>` : ""}
        </td>
      </tr>`).join("") || `<tr><td colspan="5" class="muted" style="padding:18px">No ${accountsQuery ? "matching " : (accountsStatus === "all" ? "" : "pending ")}users.</td></tr>`
    }</tbody>`;

    $("accountsTable").onclick = async (e) => {
      const ap = e.target.closest("[data-approve]");
      if (ap) { try { await IAM.approveAccount(ap.dataset.approve); toast("Account approved."); renderAccounts(); } catch (ex) { toast(ex.message, "bad"); } return; }
      const ed = e.target.closest("[data-edit-user]");
      if (ed) { return void openEditUserDrawer(ed.dataset.editUser, users.find((x) => x.id === ed.dataset.editUser)); }
      const rp = e.target.closest("[data-reset]");
      if (rp) { return void openResetPasswordPrompt(rp.dataset.reset, users.find((x) => x.id === rp.dataset.reset)); }
      const tg = e.target.closest("[data-toggle]");
      if (tg) { const next = tg.dataset.status === "active" ? "inactive" : "active"; try { await IAM.setUserStatus(tg.dataset.toggle, next); toast("User " + next + "."); renderAccounts(); } catch (ex) { toast(ex.message, "bad"); } }
    };
    $("accountsTable").onchange = async (e) => {
      const rs = e.target.closest("[data-role-user]");
      if (rs) { try { await IAM.setPlatformRole(rs.dataset.roleUser, rs.value); toast("Platform role updated."); renderAccounts(); } catch (ex) { toast(ex.message, "bad"); renderAccounts(); } }
    };
    icons();
  }

  /* ---- Create / edit user + reset password ----------------------------- */
  const ROLE_OPTS = [["user", "User"], ["admin", "Portal Admin"], ["superadmin", "Super Admin"]];

  function openCreateUserDrawer() {
    const canSuper = IAM.isSuperAdmin();
    $("drawerTitle").textContent = "Create user";
    $("drawerBody").innerHTML = `<form class="form" id="createUserForm">
      <p class="muted small">Create an account directly. The user can sign in immediately with the password you set${canSuper ? "" : " (only a Super Admin can create admin accounts)"}.</p>
      <div class="field-row">
        <label class="field"><span>First name</span><input id="cuFirst" type="text" autocomplete="off" required></label>
        <label class="field"><span>Last name</span><input id="cuLast" type="text" autocomplete="off"></label>
      </div>
      <label class="field"><span>Email</span><input id="cuEmail" type="email" autocomplete="off" required></label>
      <label class="field"><span>Temporary password</span><input id="cuPass" type="text" minlength="6" required value="${esc(randomPassword())}"></label>
      ${canSuper ? `<label class="field"><span>Platform role</span><select id="cuRole" class="select">
        ${ROLE_OPTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>` : ""}
      <p id="cuError" class="error" role="alert" hidden></p>
      <button class="btn primary block" type="submit"><i data-lucide="user-plus"></i><span>Create user</span></button>
    </form>`;
    $("drawerBackdrop").hidden = false; icons();
    $("cuFirst").focus();
    $("createUserForm").onsubmit = async (e) => {
      e.preventDefault();
      const err = $("cuError"); err.hidden = true;
      const fullName = `${$("cuFirst").value.trim()} ${$("cuLast").value.trim()}`.trim();
      if (!fullName) { err.textContent = "First name is required."; err.hidden = false; return; }
      try {
        await IAM.createUser({
          fullName,
          email: $("cuEmail").value.trim(),
          password: $("cuPass").value,
          platformRole: canSuper ? $("cuRole").value : "user"
        });
        closeDrawer(); toast("User created.");
        accountsStatus = "all"; [...$("accountsFilter").children].forEach((c) => c.classList.toggle("is-selected", c.dataset.status === "all"));
        renderAccounts();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    };
  }

  function openEditUserDrawer(id, u) {
    if (!u) return;
    $("drawerTitle").textContent = "Edit — " + u.fullName;
    $("drawerBody").innerHTML = `<div class="form">
      <form class="form" id="editUserForm">
        <label class="field"><span>User ID</span><input id="euId" type="text" value="${esc(u.id)}" readonly title="System identifier (read-only)" style="opacity:.7;cursor:text"></label>
        <label class="field"><span>Full name</span><input id="euName" type="text" value="${esc(u.fullName)}" required></label>
        <label class="field"><span>Email</span><input id="euEmail" type="email" value="${esc(u.email)}" required></label>
        <p id="euError" class="error" role="alert" hidden></p>
        <button class="btn primary block" type="submit"><i data-lucide="save"></i><span>Save changes</span></button>
      </form>
      <hr style="border:none;border-top:1px solid var(--line,#2a2a2a);margin:14px 0">
      <form class="form" id="resetPwForm">
        <label class="field"><span>New password</span><input id="rpPass" type="text" minlength="6" required value="${esc(randomPassword())}"></label>
        <p id="rpError" class="error" role="alert" hidden></p>
        <button class="btn block" type="submit"><i data-lucide="key-round"></i><span>Reset password</span></button>
      </form>
    </div>`;
    $("drawerBackdrop").hidden = false; icons();
    $("editUserForm").onsubmit = async (e) => {
      e.preventDefault();
      const err = $("euError"); err.hidden = true;
      try {
        await IAM.updateUser(id, { fullName: $("euName").value.trim(), email: $("euEmail").value.trim() });
        closeDrawer(); toast("User updated."); renderAccounts();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    };
    $("resetPwForm").onsubmit = async (e) => {
      e.preventDefault();
      const err = $("rpError"); err.hidden = true;
      try {
        await IAM.resetPassword(id, $("rpPass").value);
        closeDrawer(); toast("Password reset — share the new password with the user.");
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    };
  }

  // The Reset PW row button opens the same drawer (which has the reset section).
  function openResetPasswordPrompt(id, u) { openEditUserDrawer(id, u); }

  // A readable random temp password so admins don't have to invent one.
  function randomPassword() {
    const a = "ABCDEFGHJKLMNPQRSTUVWXYZ", b = "abcdefghijkmnpqrstuvwxyz", n = "23456789", s = "!@#$%";
    const pick = (set, k) => Array.from({ length: k }, (_, i) => set[(Date.now() * (i + 7) + i * 31) % set.length]).join("");
    return pick(a, 2) + pick(b, 4) + pick(n, 3) + s[(Date.now() / 7 | 0) % s.length];
  }

  /* ---- Audit log -------------------------------------------------------- */
  async function renderAudit() {
    let rows;
    try { rows = await IAM.listAudit(150); }
    catch (ex) { $("auditTable").innerHTML = `<tbody><tr><td>${esc(ex.message)}</td></tr></tbody>`; return; }
    const fmt = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return esc(iso); } };
    const detail = (d) => d ? esc(typeof d === "string" ? d : JSON.stringify(d)) : "";
    $("auditTable").innerHTML = `<thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Target</th><th>Detail</th></tr></thead><tbody>${
      rows.map((r) => `<tr>
        <td><small>${fmt(r.createdAt)}</small></td>
        <td><span class="badge">${esc(r.action)}</span></td>
        <td><small>${esc(r.actor || "—")}</small></td>
        <td><small>${esc(r.target || r.appId || "—")}</small></td>
        <td><small class="muted">${detail(r.detail)}</small></td>
      </tr>`).join("") || `<tr><td colspan="5" class="muted" style="padding:18px">No audit entries yet.</td></tr>`
    }</tbody>`;
  }

  /* ---- Apps & Roles (superadmin) — entitlements ------------------------- */
  async function renderAppsRoles() {
    const users = (await IAM.listUsers({})).filter((u) => u.status === "active");
    const summary = (u, appId) => {
      const e = u.entitlements.find((x) => x.appId === appId);
      if (!e) return `<span class="muted">—</span>`;
      const tags = [e.isAppAdmin ? "App Admin" : "Member"];
      if (e.canApproveDeletions) tags.push("Del");
      return `<span class="badge ${e.isAppAdmin ? "full" : "ok"}">${tags.join(" · ")}</span>`;
    };
    $("appsRolesTable").innerHTML = `<thead><tr><th>User</th>${apps.map((a) => `<th>${esc(a.name)}</th>`).join("")}<th></th></tr></thead><tbody>${
      users.map((u) => `<tr>
        <th scope="row"><strong>${esc(u.fullName)}</strong>${u.platformRole === "superadmin" ? ' <span class="badge super">Super</span>' : ""}<small>${esc(u.email)}</small></th>
        ${apps.map((a) => `<td>${summary(u, a.id)}</td>`).join("")}
        <td class="actions"><button class="btn ghost icon" data-edit="${esc(u.id)}" title="Edit apps" aria-label="Edit apps for ${esc(u.fullName)}"><i data-lucide="pencil"></i></button></td>
      </tr>`).join("")
    }</tbody>`;
    $("appsRolesTable").onclick = (e) => { const b = e.target.closest("[data-edit]"); if (b) openEntitlementDrawer(b.dataset.edit); };
    icons();
  }

  async function openEntitlementDrawer(userId) {
    const u = (await IAM.listUsers({})).find((x) => x.id === userId);
    const canSuper = IAM.isSuperAdmin();
    $("drawerTitle").textContent = "Apps & roles — " + u.fullName;
    $("drawerBody").innerHTML = `<div class="form">
      <p class="muted small">${canSuper
        ? "Assign which apps this user may use, who administers each app, and who may approve deletions. App admins then assign companies (in Company Access)."
        : "Assign which apps this user may use. App-admin and deletion-approval rights can only be set by a Super Admin."}</p>
      ${apps.map((a) => {
        const e = u.entitlements.find((x) => x.appId === a.id) || {};
        const on = !!u.entitlements.find((x) => x.appId === a.id);
        const dis = canSuper ? "" : "disabled";
        return `<div class="ent-card" data-app="${esc(a.id)}">
          <div class="ent-head"><i data-lucide="${esc(a.icon)}"></i><strong>${esc(a.name)}</strong>
            <label class="switch"><input type="checkbox" data-ent="${esc(a.id)}" ${on ? "checked" : ""}><span>Entitled</span></label>
          </div>
          <div class="ent-flags" ${on ? "" : "hidden"}>
            <label class="switch"><input type="checkbox" data-flag="isAppAdmin" data-app="${esc(a.id)}" ${e.isAppAdmin ? "checked" : ""} ${dis}><span>App admin</span></label>
            <label class="switch"><input type="checkbox" data-flag="canApproveDeletions" data-app="${esc(a.id)}" ${e.canApproveDeletions ? "checked" : ""} ${dis}><span>Can approve deletions${canSuper ? "" : " (Super Admin only)"}</span></label>
          </div>
        </div>`;
      }).join("")}
    </div>`;
    $("drawerBackdrop").hidden = false;
    icons();

    $("drawerBody").onchange = async (ev) => {
      const ent = ev.target.closest("[data-ent]");
      if (ent) {
        try {
          await IAM.setEntitlement(userId, ent.dataset.ent, { entitled: ent.checked });
          ent.closest(".ent-card").querySelector(".ent-flags").hidden = !ent.checked;
          toast(ent.checked ? "App assigned." : "App removed.");
        } catch (ex) { toast(ex.message, "bad"); ent.checked = !ent.checked; }
        return;
      }
      const flag = ev.target.closest("[data-flag]");
      if (flag) {
        try { await IAM.setEntitlement(userId, flag.dataset.app, { entitled: true, [flag.dataset.flag]: flag.checked }); toast("Updated."); }
        catch (ex) { toast(ex.message, "bad"); flag.checked = !flag.checked; }
      }
    };
  }

  /* ---- Company Access (app admins) -------------------------------------- */
  async function renderCompanyAccess() {
    const myApps = IAM.appsIAdminister();
    if (!currentApp || !myApps.includes(currentApp)) currentApp = myApps[0] || null;
    $("appPicker").innerHTML = myApps.map((id) => {
      const a = apps.find((x) => x.id === id) || { name: id, icon: "box" };
      return `<button class="chip ${id === currentApp ? "is-active" : ""}" data-app="${esc(id)}" type="button"><i data-lucide="${esc(a.icon)}"></i><span>${esc(a.name)}</span></button>`;
    }).join("");
    $("appPicker").onclick = (e) => { const b = e.target.closest("[data-app]"); if (b) { currentApp = b.dataset.app; renderCompanyAccess(); } };

    if (!currentApp) { $("companyAccessTable").innerHTML = ""; icons(); return; }

    // Columns = only the companies this app is SET UP for (central per-app list).
    const appCos = await IAM.listAppCompanies(currentApp);
    if (appCos.length === 0) {
      $("companyAccessTable").innerHTML = `<tbody><tr><td class="muted" style="padding:18px">No companies are set up for this app yet. A Super Admin or Portal Admin enables companies per app under “Companies → App availability”.</td></tr></tbody>`;
      icons(); return;
    }
    const users = (await IAM.listUsers({})).filter((u) => u.status === "active" && u.entitlements.some((e) => e.appId === currentApp));
    const levelOpts = (cur) => ["none", "view", "edit", "admin"].map((l) =>
      `<option value="${l}" ${cur === l ? "selected" : ""}>${l === "none" ? "No Access" : IAM.LEVEL_LABEL[l]}</option>`).join("");

    $("companyAccessTable").innerHTML = `<thead><tr><th>User</th>${appCos.map((c) => `<th>${esc(c.name)}</th>`).join("")}</tr></thead><tbody>${
      users.map((u) => {
        const ent = u.entitlements.find((e) => e.appId === currentApp);
        const cells = appCos.map((c) => {
          const cur = (ent.companies.find((x) => x.companyId === c.id) || {}).level || "none";
          return `<td><select class="select sm" data-user="${esc(u.id)}" data-company="${esc(c.id)}" aria-label="${esc(c.name)} access for ${esc(u.fullName)}">${levelOpts(cur)}</select></td>`;
        }).join("");
        return `<tr><th scope="row"><strong>${esc(u.fullName)}</strong>${ent.isAppAdmin ? ' <span class="badge full">App Admin</span>' : ""}<small>${esc(u.email)}</small></th>${cells}</tr>`;
      }).join("") || `<tr><td colspan="${appCos.length + 1}" class="muted" style="padding:18px">No users are entitled to this app yet. A Super Admin assigns apps in “Apps & Roles”.</td></tr>`
    }</tbody>`;

    $("companyAccessTable").onchange = async (e) => {
      const s = e.target.closest("[data-user][data-company]"); if (!s) return;
      try {
        if (s.value === "none") await IAM.removeCompanyAccess(s.dataset.user, currentApp, s.dataset.company);
        else await IAM.setCompanyAccess(s.dataset.user, currentApp, s.dataset.company, s.value);
        toast("Access updated.");
      } catch (ex) { toast(ex.message, "bad"); renderCompanyAccess(); }
    };
    icons();
  }

  /* ---- Companies -------------------------------------------------------- */
  async function renderCompanies() {
    $("newCompanyBtn").hidden = !IAM.isPortalAdmin();
    companies = await IAM.listCompanies();
    $("companiesList").innerHTML = companies.map((c) =>
      `<article class="company-card"><span class="badge ${c.status === "active" ? "ok" : "off"}">${c.status}</span><h3>${esc(c.name)}</h3><small>${esc(c.slug)}</small></article>`
    ).join("") || `<p class="muted">No companies.</p>`;
    renderAppCompanyMatrix();
  }

  // Companies × apps availability matrix (which companies each app links to).
  async function renderAppCompanyMatrix() {
    const links = await IAM.appCompanyLinks();
    const has = (appId, companyId) => links.some((l) => l.appId === appId && l.companyId === companyId);
    $("appCompanyTable").innerHTML = `<thead><tr><th>Company</th>${apps.map((a) => `<th>${esc(a.name)}</th>`).join("")}</tr></thead><tbody>${
      companies.map((c) => `<tr>
        <th scope="row"><strong>${esc(c.name)}</strong></th>
        ${apps.map((a) => `<td><label class="cellcheck"><input type="checkbox" data-app="${esc(a.id)}" data-company="${esc(c.id)}" ${has(a.id, c.id) ? "checked" : ""} aria-label="${esc(c.name)} available in ${esc(a.name)}"></label></td>`).join("")}
      </tr>`).join("")
    }</tbody>`;
    $("appCompanyTable").onchange = async (e) => {
      const box = e.target.closest("input[data-app][data-company]"); if (!box) return;
      try { await IAM.setAppCompany(box.dataset.app, box.dataset.company, box.checked); toast(box.checked ? "Company added to app." : "Company removed from app."); }
      catch (ex) { toast(ex.message, "bad"); box.checked = !box.checked; }
    };
    icons();
  }
  function onNewCompany() {
    $("drawerTitle").textContent = "New company";
    $("drawerBody").innerHTML = `<form class="form" id="newCompanyForm">
      <p class="muted small">Create an organization. You can then enable apps for it under App availability.</p>
      <label class="field"><span>Company name</span><input id="ncName" type="text" autocomplete="off" required></label>
      <p id="ncError" class="error" role="alert" hidden></p>
      <button class="btn primary block" type="submit"><i data-lucide="plus"></i><span>Create company</span></button>
    </form>`;
    $("drawerBackdrop").hidden = false; icons();
    $("ncName").focus();
    $("newCompanyForm").onsubmit = async (e) => {
      e.preventDefault();
      const err = $("ncError"); err.hidden = true;
      const name = $("ncName").value.trim();
      if (!name) { err.textContent = "Company name is required."; err.hidden = false; return; }
      try { await IAM.createCompany(name); closeDrawer(); toast("Company created."); renderCompanies(); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; }
    };
  }

  function closeDrawer() {
    $("drawerBackdrop").hidden = true;
    // Reset drag offset + any resized dimensions so the next open is centered/default.
    dragOffset = { x: 0, y: 0 };
    const d = $("drawer");
    if (d) { d.style.transform = ""; d.style.width = ""; d.style.height = ""; }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
