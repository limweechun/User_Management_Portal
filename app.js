/* User Management Portal — UI logic (talks to window.IAM) */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const icons = () => window.lucide && window.lucide.createIcons();
  const initials = (n) => (n || "").trim().split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";

  // Format an ISO timestamp per the platform's General settings (timezone + date
  // format). Falls back to the browser locale/zone if a setting is unset/invalid.
  function fmtDateTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return esc(String(iso));
    const g = (settings && settings.general_prefs) || {};
    const tz = g.timezone || undefined; // undefined → browser-local
    const fmt = g.dateFormat || "YYYY-MM-DD";
    const p = {};
    const opts = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
    try { new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...opts }).formatToParts(d).forEach((x) => (p[x.type] = x.value)); }
    catch (e) { new Intl.DateTimeFormat("en-GB", opts).formatToParts(d).forEach((x) => (p[x.type] = x.value)); }
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(p.month) - 1] || p.month;
    let date;
    if (fmt === "DD/MM/YYYY") date = `${p.day}/${p.month}/${p.year}`;
    else if (fmt === "MM/DD/YYYY") date = `${p.month}/${p.day}/${p.year}`;
    else if (fmt === "DD MMM YYYY") date = `${p.day} ${MON} ${p.year}`;
    else date = `${p.year}-${p.month}-${p.day}`;
    return `${date} ${p.hour}:${p.minute}`;
  }

  let me = null;            // result of IAM.me()
  let apps = [];            // app catalog
  let companies = [];       // all companies
  let accountsStatus = "all";
  let accountsQuery = "";   // free-text search on the accounts list
  let dragOffset = { x: 0, y: 0 };  // current modal drag offset
  let dragging = null;              // active drag session
  let currentApp = null;    // selected app in Company Access view
  let settings = {};        // portal settings
  let fbApp = "all", fbStatus = "all", fbQuery = "";  // Feedback Center filters
  let fbRows = [], fbSearchT = null;                  // loaded rows (for detail + CSV) + search debounce
  let auAction = "all", auApp = "all", auQuery = "", auOffset = 0;  // Audit Log filters + page offset
  let auRows = [], auTotal = 0, auSearchT = null;                   // loaded page + total + search debounce
  const AU_PAGE = 100;                                             // audit log page size

  // Auto-assign an App ID: first letter of each word (up to 6) + a 2-digit series
  // number (next free for that prefix). e.g. "Tex Cycle Biomass Power Plant" → tcbpp01.
  function deriveAppId(fullName) {
    const initials = String(fullName || "").trim().split(/\s+/)
      .map((w) => (w.match(/[a-z]/i) || [""])[0])  // first alphabet of the word
      .filter(Boolean).slice(0, 6).join("").toLowerCase();
    if (!initials) return "";
    const used = new Set(apps.map((a) => a.id));
    let n = 1, id;
    do { id = initials + String(n).padStart(2, "0"); n++; } while (used.has(id));
    return id;
  }

  function toast(msg, kind) {
    const t = $("toast");
    t.textContent = msg; t.className = "toast" + (kind ? " " + kind : ""); t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2400);
  }
  function hideAll() { ["authScreen", "loginScreen", "registerScreen", "forgotScreen", "resetScreen", "awaitingScreen", "deniedScreen", "launcherScreen", "shell"].forEach((id) => ($(id).hidden = true)); }

  // Wire every password show/hide (eye) toggle once. Idempotent.
  function wirePwToggles() {
    document.querySelectorAll(".pw-toggle[data-pw]").forEach((btn) => {
      if (btn.dataset.bound) return; btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        const input = $(btn.dataset.pw); if (!input) return;
        const reveal = input.type === "password";
        input.type = reveal ? "text" : "password";
        btn.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
        btn.innerHTML = '<i data-lucide="' + (reveal ? "eye-off" : "eye") + '"></i>';
        icons();
      });
    });
  }

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
    wirePwToggles();
    await applyBranding();
    const params = new URLSearchParams(location.search);
    // An app handed us off to end the shared sign-in session (single logout): clear
    // the global cookie, then show the login screen (NOT the launcher). This is what
    // makes an app's "Log out" a real logout, distinct from "Back to Apps Portal".
    if (params.get("logout") === "1") {
      try { await IAM.logout(); } catch (e) { /* ignore — cookie clear is best-effort */ }
      history.replaceState(null, "", location.pathname); // drop ?logout=1 so a refresh won't re-trigger
      return showLogin();
    }
    // A password-reset link (?reset=<token>) takes priority over any existing session.
    const resetToken = params.get("reset");
    if (resetToken) return showReset(resetToken);
    // Auth state is resolved via /me (works for the mock and the live cookie-based API).
    try { me = await IAM.me(); }
    catch (e) { return showLogin(); }
    if (me.status === "pending") return showAwaiting();
    const ret = returnTarget();
    if (ret) return void location.replace(ret); // already signed in → straight back to the app
    await showLauncher();
    // An app (e.g. PSM) repointed its "Settings" here → open Personal settings directly,
    // so a user's account (profile / password / notifications) is managed in ONE place.
    if (params.get("settings") === "me") {
      history.replaceState(null, "", location.pathname); // drop the param so a refresh won't re-open it
      openPersonalSettings();
    }
  }

  // Apply admin-configured login branding (company name / message / photo) to the login
  // screen. Public + pre-auth (GET /branding); any failure keeps the built-in text.
  async function applyBranding() {
    try {
      const b = await IAM.getBranding();
      if (b && b.companyName) {
        if ($("brandName")) $("brandName").textContent = b.companyName;
        if ($("brandFoot")) $("brandFoot").textContent = "© 2026 " + b.companyName + " · Secure by design";
      }
      if (b && b.message && $("loginSub")) $("loginSub").textContent = b.message;
      // Logo → top-center of the sign-in pane; hide the small left badge when set.
      if (b && b.logoDataUrl && $("paneLogo")) {
        const pl = $("paneLogo"); pl.innerHTML = "";
        const img = document.createElement("img"); img.src = b.logoDataUrl; img.alt = "logo";
        pl.appendChild(img); pl.hidden = false;
        if ($("brandMark")) $("brandMark").style.display = "none";
      }
      // Login photos → a row of 3–4 frames in the hero, each flipping through the set.
      const photos = (b && Array.isArray(b.photoDataUrls) && b.photoDataUrls.length)
        ? b.photoDataUrls.slice(0, 10)
        : (b && b.photoDataUrl ? [b.photoDataUrl] : []);
      startPhotoFrames(photos);
    } catch (e) { /* keep built-in defaults */ }
  }

  // Login photos shown as a row of up to 4 frames; each frame crossfades through the
  // whole set on a staggered schedule (one frame advances per tick), preferring a photo
  // not already on screen, so every uploaded photo gets shown. Restarts cleanly each call.
  let _frameTimer = null;
  function startPhotoFrames(photos) {
    const box = $("authSlides"); if (!box) return;
    if (_frameTimer) { clearInterval(_frameTimer); _frameTimer = null; }
    box.innerHTML = "";
    if (!photos.length) { box.hidden = true; return; }
    box.hidden = false;
    const n = Math.min(photos.length, 4); // 3–4 frames (fewer only if fewer photos)
    const frames = [];
    for (let f = 0; f < n; f++) {
      const frame = document.createElement("div");
      frame.className = "auth-frame";
      const startIdx = f % photos.length;
      photos.forEach((src, i) => {
        const img = document.createElement("img"); img.src = src; img.alt = "";
        if (i === startIdx) img.classList.add("is-active");
        frame.appendChild(img);
      });
      frame.dataset.idx = String(startIdx);
      box.appendChild(frame);
      frames.push(frame);
    }
    if (photos.length > n) {
      let turn = 0;
      _frameTimer = setInterval(() => {
        const frame = frames[turn % n], imgs = frame.querySelectorAll("img");
        const cur = Number(frame.dataset.idx);
        const shown = new Set(frames.map((fr) => Number(fr.dataset.idx)));
        let next = (cur + 1) % photos.length, guard = 0;
        while (shown.has(next) && guard < photos.length) { next = (next + 1) % photos.length; guard++; }
        imgs[cur].classList.remove("is-active");
        imgs[next].classList.add("is-active");
        frame.dataset.idx = String(next);
        turn++;
      }, 2800);
    }
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
    // Catalog (names/icons/urls/active) for tile rendering. NEVER let a failure here
    // blank the launcher — fall back to an empty catalog so the page still renders.
    try { apps = await IAM.listApps(); } catch (e) { console.error("listApps failed", e); apps = []; }
    let brand = {}; try { brand = await IAM.getBranding(); } catch (e) { /* keep the default badge */ }
    const catalog = Object.fromEntries((apps || []).map((a) => [a.id, a]));
    // Apps the user can open = entitled AND has >=1 company access AND is live.
    const granted = Object.entries(me.apps)
      .filter(([, info]) => info.companies && info.companies.length > 0)
      .map(([id]) => catalog[id]).filter(Boolean)
      .filter((a) => a.active !== false)
      // Show the tiles in alphanumeric order by app name (natural sort, case-insensitive).
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true, sensitivity: "base" }));

    // Apps that run their OWN backend session (not the shared cookie) need a
    // launch token handed to a specific callback route, even when same-origin.
    const HANDOFF_CALLBACK = { psjags01: "/psjags01/auth/callback" };

    // Super Admins bypass maintenance; everyone else is blocked from apps in maintenance.
    const isSuper = IAM.isSuperAdmin();

    // Mint a launch token when the app needs a handoff: external URL apps read
    // #token= at their root; HANDOFF_CALLBACK apps read it at their callback path.
    // Skip apps in maintenance that this user can't bypass (the tile won't open).
    await Promise.all(granted.map(async (a) => {
      if (a.maintenanceMode && !isSuper) return;
      const needsToken = /^https?:\/\//.test(a.url || "") || HANDOFF_CALLBACK[a.id];
      if (needsToken) {
        try {
          const companyId = (me.apps[a.id].companies[0] || {}).companyId;
          if (companyId) a._token = await IAM.appAccessToken(a.id, companyId);
        } catch { /* leave untokened — app will redirect to the portal to sign in */ }
      }
    }));

    const tiles = granted.map((a) => {
      const inMaint = !!a.maintenanceMode;
      // Non-admins can't enter an app in maintenance — render a disabled tile.
      if (inMaint && !isSuper) {
        return `
      <div class="tile" aria-disabled="true" style="opacity:.6;cursor:not-allowed" title="${esc(a.maintenanceMessage || "This app is temporarily under maintenance.")}">
        <span class="tile-icon"><i data-lucide="${esc(a.icon)}"></i></span>
        <strong>${esc(a.name)}</strong>
        <span class="tile-go" style="color:#b23b2e"><i data-lucide="wrench"></i> Under maintenance</span>
      </div>`;
      }
      const callback = HANDOFF_CALLBACK[a.id];
      // Proxied apps ALWAYS launch at the gateway mount "/<id>". Ignore a stale/typo'd
      // relative URL (e.g. "/procure" for p01) so a bad catalog value can't break the
      // tile — only honor a same-app deep link ("/<id>/..."). A full http(s):// URL is an
      // external app, already handled via the token branch above.
      const mount = "/" + a.id;
      const internal = a.url === mount || (a.url || "").startsWith(mount + "/") ? a.url : mount;
      const href = a._token
        ? `${esc(callback || a.url)}#token=${a._token}`
        : esc(internal);
      return `
      <a class="tile" href="${href}">
        <span class="tile-icon"><i data-lucide="${esc(a.icon)}"></i></span>
        <strong>${esc(a.name)}</strong>
        ${inMaint ? `<span class="tile-go" style="color:#d87329"><i data-lucide="wrench"></i> Maintenance — enter</span>` : `<span class="tile-go">Open <i data-lucide="arrow-right"></i></span>`}
      </a>`;
    }).join("");
    const adminTile = IAM.canUsePortal() ? `
      <button class="tile tile-admin" id="tileAdmin" type="button">
        <span class="tile-icon"><i data-lucide="shield"></i></span>
        <strong>User Management</strong>
        <span class="tile-go">Manage <i data-lucide="arrow-right"></i></span>
      </button>` : "";

    const brandMark = brand.shortLogoDataUrl
      ? `<span class="brand-mark has-img"><img src="${brand.shortLogoDataUrl}" alt=""></span>`
      : `<span class="brand-mark">WO</span>`;
    $("launcherScreen").innerHTML = `
      <header class="launch-top">
        <div class="brand">${brandMark}<div><strong>Workplace Operations</strong><small>Choose an app</small></div></div>
        <div class="user-chip">
          <button class="chip-btn" id="launchSettings" type="button" aria-label="Personal settings" title="Personal settings">
            <span class="avatar">${esc(initials(me.user.fullName))}</span>
            <span class="meta"><strong>${esc(me.user.fullName)}</strong><small>${esc(me.user.email)}</small></span>
            <i data-lucide="settings-2" class="chip-cog"></i>
          </button>
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
    $("launchSettings").onclick = openPersonalSettings;
    $("launchOut").onclick = doLogout;
    bindDrawer(); // so the personal-settings modal works from the launcher too
    icons();
  }

  /* ---- Auth screens ----------------------------------------------------- */
  // Real logout: end the shared session (clear the cookie) BEFORE showing login, so a
  // quick reload can't land back on the launcher with a still-valid cookie. Used by every
  // "Sign out" in the portal (launcher, shell, awaiting, denied) for one consistent logout.
  async function doLogout() {
    try { await IAM.logout(); } catch (e) { /* best-effort cookie clear */ }
    showLogin();
  }

  function showLogin() {
    hideAll(); $("authScreen").hidden = false; $("loginScreen").hidden = false;
    applyBranding(); // re-apply admin branding (covers showing login after logout, no reload)
    const form = $("loginForm"), err = $("loginError");
    if (!form.dataset.bound) {
      form.dataset.bound = "1";
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); err.hidden = true;
        try { await IAM.login($("loginEmail").value, $("loginPass").value, $("rememberMe").checked); routeAuthed(); }
        catch (ex) { err.textContent = ex.message; err.hidden = false; }
      });
      $("toRegisterBtn").addEventListener("click", (e) => { e.preventDefault(); showRegister(); });
      $("toForgot").addEventListener("click", (e) => { e.preventDefault(); showForgot(); });
    }
    icons(); $("loginEmail").focus();
  }

  function showRegister() {
    hideAll(); $("authScreen").hidden = false; $("registerScreen").hidden = false;
    const form = $("registerForm"), err = $("regError");
    if (!form.dataset.bound) {
      form.dataset.bound = "1";
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); err.hidden = true;
        try {
          const r = await IAM.register({ email: $("regEmail").value, fullName: $("regName").value, password: $("regPass").value });
          // Verify the email BEFORE logging in — sign-in now requires a verified
          // email. (In the demo we auto-verify with the returned token; in
          // production the user clicks a link in their inbox first.)
          await IAM.verifyEmail(r.verifyToken);
          await IAM.login($("regEmail").value, $("regPass").value);
          routeAuthed();
        } catch (ex) { err.textContent = ex.message; err.hidden = false; }
      });
      $("toLogin").addEventListener("click", (e) => { e.preventDefault(); showLogin(); });
    }
    icons(); $("regName").focus();
  }

  function showForgot() {
    hideAll(); $("authScreen").hidden = false; $("forgotScreen").hidden = false;
    const form = $("forgotForm"), err = $("forgotError"), ok = $("forgotOk");
    if (!form.dataset.bound) {
      form.dataset.bound = "1";
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); err.hidden = true; ok.hidden = true;
        const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
        try {
          const r = await IAM.forgotPassword($("forgotEmail").value);
          const msg = (r && r.message) || "If an account exists for that email, a password reset link has been sent.";
          // Dev convenience: the API returns the link directly when email isn't configured.
          if (r && r.devResetLink) ok.innerHTML = esc(msg) + ' <a class="link" href="' + esc(r.devResetLink) + '">Open reset link (dev)</a>';
          else ok.textContent = msg;
          ok.hidden = false;
        } catch (ex) { err.textContent = ex.message; err.hidden = false; }
        finally { btn.disabled = false; }
      });
      $("forgotToLogin").addEventListener("click", (e) => { e.preventDefault(); showLogin(); });
    }
    icons(); $("forgotEmail").focus();
  }

  function showReset(token) {
    hideAll(); $("authScreen").hidden = false; $("resetScreen").hidden = false;
    const form = $("resetForm"), err = $("resetError");
    if (!form.dataset.bound) {
      form.dataset.bound = "1";
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); err.hidden = true;
        const p1 = $("resetPass").value, p2 = $("resetPass2").value;
        if (p1.length < 6) { err.textContent = "Password must be at least 6 characters."; err.hidden = false; return; }
        if (p1 !== p2) { err.textContent = "The two passwords don't match."; err.hidden = false; return; }
        const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
        try {
          await IAM.resetPasswordWithToken(form.dataset.token, p1);
          history.replaceState(null, "", location.pathname); // drop ?reset= from the URL
          toast("Password updated — please sign in.");
          showLogin();
        } catch (ex) { err.textContent = ex.message; err.hidden = false; }
        finally { btn.disabled = false; }
      });
      $("resetToLogin").addEventListener("click", (e) => { e.preventDefault(); history.replaceState(null, "", location.pathname); showLogin(); });
    }
    form.dataset.token = token; // stash for the bound-once submit handler
    icons(); $("resetPass").focus();
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
    $("awaitOut").onclick = doLogout;
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
    $("denOut").onclick = doLogout;
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
    // Platform-role badge on the account chip, matching the other apps' top bars.
    const PR_LABEL = { superadmin: "Super Admin", admin: "Admin", user: "User" };
    const pr = me.platformRole || (me.user && me.user.platformRole) || "user";
    $("meRole").textContent = PR_LABEL[pr] || pr;
    $("meRole").hidden = false;

    const canPortalAdmin = IAM.isPortalAdmin();
    const canSuper = IAM.isSuperAdmin();
    const myAdminApps = IAM.appsIAdminister();
    $("navAccounts").hidden = !canPortalAdmin;
    $("navAppsRoles").hidden = !canPortalAdmin;   // portal admins may assign apps too
    $("navCompanyAccess").hidden = !canPortalAdmin && myAdminApps.length === 0;
    $("navCompanies").hidden = !canPortalAdmin;
    $("navApps").hidden = !canPortalAdmin;
    $("navFeedback").hidden = myAdminApps.length === 0 && !canPortalAdmin;
    $("navAudit").hidden = !canPortalAdmin;
    $("settingsBtn").hidden = !canPortalAdmin;
    syncNavGroups();
    try { settings = await IAM.loadSettings(); } catch { settings = {}; }

    bindShell();
    const first = canPortalAdmin ? "accounts" : (canSuper ? "appsRoles" : "companyAccess");
    setView(first);
    icons();
  }

  // Hide a nav section header when all of its items are hidden for this user.
  function syncNavGroups() {
    document.querySelectorAll(".nav-group").forEach((g) => {
      const anyVisible = [...g.querySelectorAll(".nav-item")].some((b) => !b.hidden);
      g.hidden = !anyVisible;
    });
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
    $("signOutBtn").addEventListener("click", doLogout);
    $("meSettingsBtn").addEventListener("click", openPersonalSettings);
    $("feedbackBtn").addEventListener("click", openFeedbackDrawer);
    $("newCompanyBtn").addEventListener("click", () => openCompanyDrawer(null));
    bindDrawer();
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
    $("settingsBtn").addEventListener("click", () => setView("settings"));
    $("newAppBtn").addEventListener("click", () => openAppDrawer(null));
  }

  // Drawer (shared modal) bindings — bound once, used by BOTH the portal shell
  // and the app launcher (so personal settings works even for non-admin users
  // who only ever see the launcher and never enter the shell).
  function bindDrawer() {
    if (bindDrawer._done) return; bindDrawer._done = true;
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
  }

  const VIEW_META = {
    accounts: ["User Global Roles", "Set each user's global role and manage account status / sign-up approvals. (Super Admin / Portal Admin)"],
    appsRoles: ["User & Apps", "Assign which apps each user may use. (Super Admin / Portal Admin — making an app admin & deletion-approval rights are Super Admin only.)"],
    companyAccess: ["Company & App Roles", "Pick an app, set up which companies it serves, then assign each entitled user's role per company."],
    companies: ["Company Setup", "Manage all company profiles and details."],
    apps: ["Organize Apps", "Register and edit the apps in the platform catalog (name, short name, icon, URL)."],
    feedback: ["Feedback Center", "Feedback collected from every app across the platform."],
    audit: ["Audit Log", "Recent administrative actions across the platform (most recent first)."],
    settings: ["Admin Settings", "Global email (SMTP) configuration."]
  };
  function setView(view) {
    ["accounts", "appsRoles", "companyAccess", "companies", "apps", "feedback", "audit", "settings"].forEach((v) => ($(v + "View").hidden = v !== view));
    const nav = $("nav").querySelector(`[data-view="${view}"]`);
    document.querySelectorAll(".nav-item").forEach((n) => n.classList.toggle("is-active", n === nav));
    $("viewTitle").textContent = VIEW_META[view][0];
    $("viewSub").textContent = VIEW_META[view][1];
    $("viewTitle").focus();
    if (view === "accounts") renderAccounts();
    else if (view === "appsRoles") renderAppsRoles();
    else if (view === "companyAccess") renderCompanyAccess();
    else if (view === "apps") renderApps();
    else if (view === "feedback") renderFeedback();
    else if (view === "audit") renderAudit();
    else if (view === "settings") renderSettings();
    else renderCompanies();
  }

  /* ---- Accounts --------------------------------------------------------- */
  async function renderAccounts() {
    const canSuper = IAM.isSuperAdmin();
    let all;
    // Fetch the FULL list so the summary count cards are stable regardless of the
    // current filter/search.
    try { all = await IAM.listUsers({}); }
    catch (ex) { $("accountsTable").innerHTML = `<tbody><tr><td>${esc(ex.message)}</td></tr></tbody>`; return; }

    renderUserStats(all);

    // Client-side filter (status + search).
    const q = accountsQuery.toLowerCase();
    const users = all.filter((u) => {
      if (accountsStatus !== "all" && u.status !== "pending") return false;
      if (q && (u.fullName + " " + u.email).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });

    const roleCell = (u) => canSuper
      ? `<select class="select sm" data-role-user="${esc(u.id)}" aria-label="Role for ${esc(u.fullName)}">
           ${roleOptionsHtml(u.globalRole)}
         </select>`
      : `<span class="badge">${esc(roleLabel(u.globalRole))}</span>`;

    $("accountsTable").innerHTML = `<thead><tr><th>User ID</th><th>User</th><th>Phone</th><th>Approval Status</th><th>Email Status</th><th>Role</th><th>Actions</th></tr></thead><tbody>${
      users.map((u) => `<tr>
        <td>${u.userCode ? `<code class="uid">${esc(u.userCode)}</code>` : '<span class="muted">—</span>'}</td>
        <th scope="row"><strong>${esc(u.fullName)}</strong><small>${esc(u.email)}</small></th>
        <td>${u.phone ? esc(u.phone) : '<span class="muted">—</span>'}</td>
        <td><span class="badge ${u.status === "active" ? "ok" : u.status === "pending" ? "warn" : "off"}">${u.status}</span></td>
        <td><span class="badge ${u.emailVerified ? "ok" : "off"}">${u.emailVerified ? "Verified" : "Unverified"}</span></td>
        <td>${roleCell(u)}</td>
        <td class="actions">
          ${u.status === "pending" ? `<button class="btn primary sm" data-approve="${esc(u.id)}">Approve</button>` : ""}
          ${!u.emailVerified ? `<button class="btn ghost sm" data-verify-user="${esc(u.id)}" title="Mark this user's email as verified">Verify</button>` : ""}
          <button class="btn ghost sm" data-edit-user="${esc(u.id)}">Edit</button>
          ${u.status !== "pending" ? `<button class="btn ghost sm" data-toggle="${esc(u.id)}" data-status="${u.status}">${u.status === "active" ? "Deactivate" : "Activate"}</button>` : ""}
        </td>
      </tr>`).join("") || `<tr><td colspan="7" class="muted" style="padding:18px">No ${accountsQuery ? "matching " : (accountsStatus === "all" ? "" : "pending ")}users.</td></tr>`
    }</tbody>`;

    $("accountsTable").onclick = async (e) => {
      const ap = e.target.closest("[data-approve]");
      if (ap) { try { await IAM.approveAccount(ap.dataset.approve); toast("Account approved."); renderAccounts(); } catch (ex) { toast(ex.message, "bad"); } return; }
      const vu = e.target.closest("[data-verify-user]");
      if (vu) { try { await IAM.updateUser(vu.dataset.verifyUser, { emailVerified: true }); toast("Email marked verified."); renderAccounts(); } catch (ex) { toast(ex.message, "bad"); } return; }
      const ed = e.target.closest("[data-edit-user]");
      if (ed) { return void openEditUserDrawer(ed.dataset.editUser, users.find((x) => x.id === ed.dataset.editUser)); }
      const tg = e.target.closest("[data-toggle]");
      if (tg) { const next = tg.dataset.status === "active" ? "inactive" : "active"; try { await IAM.setUserStatus(tg.dataset.toggle, next); toast("User " + next + "."); renderAccounts(); } catch (ex) { toast(ex.message, "bad"); } }
    };
    $("accountsTable").onchange = async (e) => {
      const rs = e.target.closest("[data-role-user]");
      if (rs) { try { await IAM.setGlobalRole(rs.dataset.roleUser, rs.value); toast("Role updated."); renderAccounts(); } catch (ex) { toast(ex.message, "bad"); renderAccounts(); } }
    };
    icons();
  }

  // Count cards: total + per platform-role + approval-status + email-status breakdowns.
  function renderUserStats(all) {
    const by = { superadmin: 0, admin: 0, user: 0 };
    const st = { pending: 0, active: 0, inactive: 0 };
    let verified = 0, unverified = 0;
    all.forEach((u) => {
      by[u.platformRole] = (by[u.platformRole] || 0) + 1;
      st[u.status] = (st[u.status] || 0) + 1;
      if (u.emailVerified) verified++; else unverified++;
    });
    const card = (label, n, icon, cls) =>
      `<div class="stat-card ${cls || ""}"><span class="stat-ic"><i data-lucide="${icon}"></i></span><div><strong>${n}</strong><small>${label}</small></div></div>`;
    // Breakdown card: one title + several sub-counts.
    const breakdown = (label, icon, items) =>
      `<div class="stat-card breakdown"><span class="stat-ic"><i data-lucide="${icon}"></i></span><div>
        <small class="bd-title">${label}</small>
        <div class="bd-row">${items.map((it) => `<span class="bd-item"><strong>${it.n}</strong><span>${it.label}</span></span>`).join("")}</div>
      </div></div>`;
    $("userStats").innerHTML =
      card("Total users", all.length, "users", "total") +
      card("Super Admins", by.superadmin || 0, "shield", "") +
      card("Portal Admins", by.admin || 0, "shield-check", "") +
      card("Users", by.user || 0, "user", "") +
      breakdown("Approval Status", "user-check", [
        { label: "Pending", n: st.pending || 0 },
        { label: "Active", n: st.active || 0 },
        { label: "Inactive", n: st.inactive || 0 }
      ]) +
      breakdown("Email Status", "mail-check", [
        { label: "Verified", n: verified },
        { label: "Unverified", n: unverified }
      ]);
    icons();
  }

  /* ---- Admin Settings (tabs: General · Email · ID Format) -------------- */
  let settingsTab = "general"; // active Admin Settings tab

  async function renderSettings() {
    const host = $("settingsBody");
    const tab = (id, label, icon) => `<button class="tab ${settingsTab === id ? "is-active" : ""}" data-stab="${id}" type="button"><i data-lucide="${icon}"></i><span>${label}</span></button>`;
    host.innerHTML = `<div class="tabbar">${tab("general", "General", "sliders-horizontal")}${tab("email", "Email", "mail")}${tab("idformat", "ID Format", "hash")}</div><div id="settingsTabBody"></div>`;
    host.querySelector(".tabbar").onclick = (e) => {
      const b = e.target.closest("[data-stab]"); if (!b || b.dataset.stab === settingsTab) return;
      settingsTab = b.dataset.stab; renderSettings();
    };
    icons();
    if (settingsTab === "general") return renderSettingsGeneral();
    if (settingsTab === "idformat") return renderSettingsIdFormat();
    return renderSettingsEmail();
  }

  // Wire an image upload/drop zone (file picker + drag&drop + preview + clear).
  // Returns { get: () => dataUrl }. maxMB defaults to 2.
  function wireImageUpload(dropId, previewId, ctaId, inputId, clearId, initial, maxMB, downscaleMax) {
    let data = initial || "";
    const drop = $(dropId), preview = $(previewId), cta = $(ctaId), input = $(inputId), clearBtn = $(clearId);
    const max = (maxMB || 2) * 1024 * 1024;
    const set = (d) => {
      data = d || "";
      if (data) { preview.src = data; preview.hidden = false; cta.hidden = true; if (clearBtn) clearBtn.hidden = false; }
      else { preview.removeAttribute("src"); preview.hidden = true; cta.hidden = false; if (clearBtn) clearBtn.hidden = true; }
    };
    const read = (file) => {
      if (!file) return;
      if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return toast("Use a PNG, JPG, WEBP or SVG image.", "bad");
      if (file.size > max) return toast("Image must be ≤ " + (maxMB || 2) + " MB.", "bad");
      const r = new FileReader();
      r.onload = () => {
        const url = String(r.result);
        // Downscale big raster photos so the login page stays light (SVG kept as-is).
        if (downscaleMax && file.type !== "image/svg+xml") {
          const im = new Image();
          im.onload = () => {
            try {
              const scale = Math.min(1, downscaleMax / Math.max(im.width, im.height));
              if (scale >= 1) return set(url);
              const c = document.createElement("canvas");
              c.width = Math.round(im.width * scale); c.height = Math.round(im.height * scale);
              c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
              set(c.toDataURL("image/jpeg", 0.82));
            } catch (e) { set(url); }
          };
          im.onerror = () => set(url);
          im.src = url;
        } else set(url);
      };
      r.readAsDataURL(file);
    };
    drop.onclick = () => input.click();
    input.onchange = () => read(input.files[0]);
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("is-drag"); };
    drop.ondragleave = () => drop.classList.remove("is-drag");
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("is-drag"); read(e.dataTransfer.files && e.dataTransfer.files[0]); };
    if (clearBtn) clearBtn.onclick = () => set("");
    return { get: () => data };
  }

  // Multi-image upload zone: pick/drop several at once → removable thumbnail gallery,
  // capped at maxN. Returns { get: () => [dataUrl,...] }. Downscales raster photos.
  function wireMultiImageUpload(dropId, inputId, galleryId, initial, maxN, maxMB, downscaleMax, addBtnId) {
    let items = (Array.isArray(initial) ? initial : []).slice(0, maxN || 4);
    const drop = $(dropId), input = $(inputId), gallery = $(galleryId);
    const cap = maxN || 4, max = (maxMB || 2) * 1024 * 1024;
    const render = () => {
      gallery.innerHTML = items.map((src, i) =>
        `<div class="ph-thumb"><img src="${src}" alt=""><button type="button" class="ph-del" data-i="${i}" title="Remove" aria-label="Remove photo">&times;</button></div>`).join("");
      gallery.hidden = !items.length;
      const span = drop.querySelector(".photo-cta span");
      if (span) span.textContent = items.length >= cap ? `Maximum ${cap} photos — remove one to add another` : `Click or drop images to add (${items.length}/${cap})`;
    };
    const addOne = (file) => new Promise((resolve) => {
      if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) { toast("Use a PNG, JPG or WEBP image.", "bad"); return resolve(); }
      if (file.size > max) { toast("Each image must be ≤ " + (maxMB || 2) + " MB.", "bad"); return resolve(); }
      const r = new FileReader();
      r.onload = () => {
        const url = String(r.result);
        if (downscaleMax) {
          const im = new Image();
          im.onload = () => {
            try {
              const scale = Math.min(1, downscaleMax / Math.max(im.width, im.height));
              if (scale >= 1) { items.push(url); return resolve(); }
              const c = document.createElement("canvas");
              c.width = Math.round(im.width * scale); c.height = Math.round(im.height * scale);
              c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
              items.push(c.toDataURL("image/jpeg", 0.82));
            } catch (e) { items.push(url); }
            resolve();
          };
          im.onerror = () => { items.push(url); resolve(); };
          im.src = url;
        } else { items.push(url); resolve(); }
      };
      r.readAsDataURL(file);
    });
    const addFiles = async (fileList) => {
      const files = Array.from(fileList || []); let skipped = false;
      for (const f of files) { if (items.length >= cap) { skipped = true; break; } await addOne(f); }
      if (skipped) toast(`Up to ${cap} photos — extra files were skipped.`, "bad");
      render();
    };
    drop.onclick = () => input.click();
    if (addBtnId && $(addBtnId)) $(addBtnId).onclick = () => input.click();
    input.onchange = () => { addFiles(input.files); input.value = ""; };
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("is-drag"); };
    drop.ondragleave = () => drop.classList.remove("is-drag");
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("is-drag"); addFiles(e.dataTransfer.files); };
    gallery.onclick = (e) => { const del = e.target.closest(".ph-del"); if (del) { items.splice(Number(del.dataset.i), 1); render(); } };
    render();
    return { get: () => items.slice() };
  }

  // --- General: login-page branding (company name / message / logo / photo) + prefs ---
  async function renderSettingsGeneral() {
    const host = $("settingsTabBody");
    host.innerHTML = `<p class="muted">Loading…</p>`;
    let s = {}; try { s = await IAM.loadSettings(); } catch (e) { s = {}; }
    const b = s.login_branding || {}, g = s.general_prefs || {};
    const tz = ["UTC", "Asia/Kuala_Lumpur", "Asia/Singapore", "Asia/Jakarta", "Asia/Bangkok", "Asia/Hong_Kong", "Asia/Tokyo", "Europe/London", "America/New_York"];
    const df = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", "DD MMM YYYY"];
    const cur = ["USD ($)", "MYR (RM)", "SGD (S$)", "EUR (€)", "GBP (£)", "IDR (Rp)", "THB (฿)"];
    const lang = ["English", "Bahasa Melayu", "中文", "Bahasa Indonesia"];
    const opt = (list, sel) => list.map((x) => `<option ${x === sel ? "selected" : ""}>${esc(x)}</option>`).join("");
    const photoList = (Array.isArray(b.photoDataUrls) && b.photoDataUrls.length) ? b.photoDataUrls.slice(0, 10) : (b.photoDataUrl ? [b.photoDataUrl] : []);
    host.innerHTML = `
      <p class="muted">Customize the login page, plus platform-wide preferences.</p>
      <div class="setting-card">
        <h3 class="set-h">Login page</h3>
        <div class="email-grid">
          <label class="field"><span>Login Page Company Name</span><input class="input" id="gnName" value="${esc(b.companyName || "")}" placeholder="e.g. True Eco Group"></label>
          <label class="field" style="grid-column:1/-1"><span>Login Page Message</span><input class="input" id="gnMsg" value="${esc(b.message || "")}" placeholder="e.g. Welcome back! Please sign in to continue."></label>
        </div>
        <div class="email-grid" style="margin-top:12px">
          <div class="field"><span>Company Logo <small class="muted" style="font-weight:600">(sign-in pane · PNG/SVG · ≤1 MB)</small></span>
            <div class="photo-drop logo-drop" id="gnLogoDrop">
              <img id="gnLogoPreview" class="photo-preview" ${b.logoDataUrl ? `src="${b.logoDataUrl}"` : "hidden"} alt="">
              <div class="photo-cta" id="gnLogoCta" ${b.logoDataUrl ? "hidden" : ""}><i data-lucide="image-plus"></i><span>Upload logo</span></div>
            </div>
            <input type="file" id="gnLogoInput" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
            <div style="margin-top:6px"><button class="btn ghost sm" id="gnLogoClear" type="button" ${b.logoDataUrl ? "" : "hidden"}><i data-lucide="trash-2"></i><span>Remove logo</span></button></div>
          </div>
          <div class="field"><span>Short Company Logo <small class="muted" style="font-weight:600">(compact icon · square · shown in the apps-portal header · PNG/SVG · ≤1 MB)</small></span>
            <div class="photo-drop logo-drop" id="gnShortLogoDrop">
              <img id="gnShortLogoPreview" class="photo-preview" ${b.shortLogoDataUrl ? `src="${b.shortLogoDataUrl}"` : "hidden"} alt="">
              <div class="photo-cta" id="gnShortLogoCta" ${b.shortLogoDataUrl ? "hidden" : ""}><i data-lucide="image-plus"></i><span>Upload short logo</span></div>
            </div>
            <input type="file" id="gnShortLogoInput" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
            <div style="margin-top:6px"><button class="btn ghost sm" id="gnShortLogoClear" type="button" ${b.shortLogoDataUrl ? "" : "hidden"}><i data-lucide="trash-2"></i><span>Remove short logo</span></button></div>
          </div>
        </div>
        <div class="field" style="margin-top:12px"><span>Login Page Photos <small class="muted" style="font-weight:600">(up to 10 — they crossfade/flip on the login page · PNG/JPG/WEBP · ≤2 MB each)</small></span>
          <div class="photo-drop" id="gnPhotosDrop">
            <div class="photo-cta" id="gnPhotosCta"><i data-lucide="image"></i><span>Click or drop images to add</span></div>
          </div>
          <input type="file" id="gnPhotosInput" accept="image/png,image/jpeg,image/webp" multiple hidden>
          <div style="margin-top:8px"><button class="btn ghost sm" id="gnPhotosAdd" type="button"><i data-lucide="image-plus"></i><span>Add photos</span></button></div>
          <div class="photos-gallery" id="gnPhotosGallery" hidden></div>
        </div>
        <h3 class="set-h" style="margin-top:18px">Preferences <small class="muted" style="font-weight:600">(saved now; app-wide enforcement is a later step)</small></h3>
        <div class="email-grid">
          <label class="field"><span>Timezone</span><select class="select" id="gnTz">${opt(tz, g.timezone || "UTC")}</select></label>
          <label class="field"><span>Date Format</span><select class="select" id="gnDf">${opt(df, g.dateFormat || "YYYY-MM-DD")}</select></label>
          <label class="field"><span>Currency</span><select class="select" id="gnCur">${opt(cur, g.currency || "USD ($)")}</select></label>
          <label class="field"><span>Language</span><select class="select" id="gnLang">${opt(lang, g.language || "English")}</select></label>
        </div>
        <div class="row-actions" style="margin-top:14px;display:flex;gap:10px;align-items:center"><button class="btn primary" id="gnSave" type="button"><i data-lucide="save"></i><span>Save general settings</span></button><span id="gnOut" class="small"></span></div>
      </div>`;
    icons();

    const logoUp = wireImageUpload("gnLogoDrop", "gnLogoPreview", "gnLogoCta", "gnLogoInput", "gnLogoClear", b.logoDataUrl || "", 1);
    const shortLogoUp = wireImageUpload("gnShortLogoDrop", "gnShortLogoPreview", "gnShortLogoCta", "gnShortLogoInput", "gnShortLogoClear", b.shortLogoDataUrl || "", 1);
    const photoUp = wireMultiImageUpload("gnPhotosDrop", "gnPhotosInput", "gnPhotosGallery", photoList, 10, 2, 1280, "gnPhotosAdd");

    $("gnSave").onclick = async () => {
      const out = $("gnOut"); out.style.color = "var(--muted)"; out.textContent = "Saving…";
      const prefs = { timezone: $("gnTz").value, dateFormat: $("gnDf").value, currency: $("gnCur").value, language: $("gnLang").value };
      try {
        const photoDataUrls = photoUp.get();
        await IAM.saveSetting("login_branding", { companyName: $("gnName").value.trim(), message: $("gnMsg").value.trim(), logoDataUrl: logoUp.get(), photoDataUrls, photoDataUrl: photoDataUrls[0] || "", shortLogoDataUrl: shortLogoUp.get() });
        await IAM.saveSetting("general_prefs", prefs);
        settings.general_prefs = prefs; // live so date displays reflect the change without a reload
        out.style.color = "var(--green)"; out.textContent = "✓ Saved — the login page is updated.";
        toast("General settings saved.");
      } catch (ex) { out.style.color = "#b23b2e"; out.textContent = "✗ " + ex.message; }
    };
  }

  // --- ID Format: GLOBAL human-readable User-ID format (prefix/sequence) ---
  function idfPreview(f) {
    const now = new Date(), yy = String(now.getFullYear()).slice(-2), mm = String(now.getMonth() + 1).padStart(2, "0");
    const sep = f.separator || "", parts = [f.prefix || "UR"];
    if (f.includeYear) parts.push(yy);
    if (f.includeMonth) parts.push(mm);
    return parts.join(sep) + sep + String(1).padStart(f.seqDigits || 4, "0");
  }
  async function renderSettingsIdFormat() {
    const host = $("settingsTabBody");
    host.innerHTML = `<p class="muted">Loading…</p>`;
    let s = {}; try { s = await IAM.loadSettings(); } catch (e) { s = {}; }
    const list = Array.isArray(s.idFormats) ? s.idFormats : [];
    const f = Object.assign({ prefix: "UR", separator: "-", includeYear: false, includeMonth: false, seqDigits: 4 }, list.find((e) => e && e.entityKey === "user") || {});
    const sepOpts = [["-", "- (dash)"], ["_", "_ (underscore)"], ["/", "/ (slash)"], ["", "(none)"]];
    host.innerHTML = `
      <p class="muted">The <strong>global</strong> format for human-readable <strong>User IDs</strong>, applied to every new user across the whole platform — <strong>not</strong> per-app or per-company. Changing it affects <em>new</em> users only; existing IDs keep their code.</p>
      <div class="setting-card">
        <div class="email-grid">
          <label class="field"><span>Prefix</span><input class="input" id="idfPrefix" maxlength="8" value="${esc(f.prefix || "UR")}" placeholder="UR"></label>
          <label class="field"><span>Separator</span><select class="select" id="idfSep">${sepOpts.map(([v, l]) => `<option value="${v}" ${v === f.separator ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
          <label class="field"><span>Number of digits</span><select class="select" id="idfDigits">${[2, 3, 4, 5].map((n) => `<option ${n === f.seqDigits ? "selected" : ""}>${n}</option>`).join("")}</select></label>
          <label class="switch"><input type="checkbox" id="idfYear" ${f.includeYear ? "checked" : ""}><span>Include year (YY)</span></label>
          <label class="switch"><input type="checkbox" id="idfMonth" ${f.includeMonth ? "checked" : ""}><span>Include month (MM)</span></label>
        </div>
        <div class="preview-box" style="margin-top:14px">Next User ID preview: <strong id="idfPreview" class="uid">${esc(idfPreview(f))}</strong></div>
        <div class="row-actions" style="margin-top:14px;display:flex;gap:10px;align-items:center"><button class="btn primary" id="idfSave" type="button"><i data-lucide="save"></i><span>Save ID format</span></button><span id="idfOut" class="small"></span></div>
      </div>`;
    icons();
    const readFmt = () => ({ entityKey: "user", entityLabel: "User", prefix: ($("idfPrefix").value.trim().toUpperCase() || "UR").slice(0, 8), separator: $("idfSep").value, includeYear: $("idfYear").checked, includeMonth: $("idfMonth").checked, seqDigits: Number($("idfDigits").value) || 4 });
    const refresh = () => { $("idfPreview").textContent = idfPreview(readFmt()); };
    ["idfPrefix", "idfSep", "idfDigits", "idfYear", "idfMonth"].forEach((id) => { $(id).oninput = refresh; $(id).onchange = refresh; });
    $("idfSave").onclick = async () => {
      const out = $("idfOut"); out.style.color = "var(--muted)"; out.textContent = "Saving…";
      try {
        const others = list.filter((e) => e && e.entityKey !== "user");
        await IAM.saveSetting("idFormats", [readFmt(), ...others]);
        out.style.color = "var(--green)"; out.textContent = "✓ Saved — new users will use " + idfPreview(readFmt()) + ".";
        toast("User-ID format saved.");
      } catch (ex) { out.style.color = "#b23b2e"; out.textContent = "✗ " + ex.message; }
    };
  }

  // --- Email: global SMTP configuration ---
  async function renderSettingsEmail() {
    const host = $("settingsTabBody");
    host.innerHTML = `<p class="muted">Loading email settings…</p>`;
    const ec = await IAM.getEmailConfig().catch(() => ({ enabled: false, host: "", port: 587, secure: false, user: "", hasPassword: false, fromName: "", fromEmail: "" }));
    host.innerHTML = `
      <p class="muted">Global SMTP settings the platform uses to send email (verification, password resets, notifications). Stored centrally; the password is never shown back.</p>
      <div id="emDiag" class="small" style="margin:0 0 14px;padding:10px 12px;border-radius:8px;background:var(--surface-soft,#eef2ef);line-height:1.7">Checking the saved SMTP connection…</div>
      <div class="setting-card">
        <label class="switch" style="margin-bottom:12px"><input type="checkbox" id="emEnabled" ${ec.enabled ? "checked" : ""}><span>Enable email sending</span></label>
        <div class="email-grid">
          <label class="field"><span>SMTP host</span><input class="input" id="emHost" value="${esc(ec.host || "")}" placeholder="e.g. smtp.gmail.com"></label>
          <label class="field"><span>Port</span><input class="input" id="emPort" type="number" value="${esc(ec.port || 587)}"></label>
          <label class="switch"><input type="checkbox" id="emSecure" ${ec.secure ? "checked" : ""}><span>SSL/TLS (port 465)</span></label>
          <label class="field"><span>Username</span><input class="input" id="emUser" value="${esc(ec.user || "")}" autocomplete="off" placeholder="SMTP username"></label>
          <label class="field"><span>Password</span><input class="input" id="emPass" type="password" autocomplete="new-password" placeholder="${ec.hasPassword ? "•••••• (leave blank to keep)" : "SMTP password"}"></label>
          <label class="field"><span>From name</span><input class="input" id="emFromName" value="${esc(ec.fromName || "")}" placeholder="e.g. Workplace Operations"></label>
          <label class="field"><span>From email</span><input class="input" id="emFromEmail" value="${esc(ec.fromEmail || "")}" placeholder="e.g. noreply@company.com"></label>
        </div>
        <div class="row-actions" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px">
          <button class="btn primary" id="saveEmailBtn" type="button"><i data-lucide="save"></i><span>Save email settings</span></button>
          <span style="width:1px;height:24px;background:var(--line);margin:0 4px"></span>
          <input class="input sm" id="emTestTo" type="email" placeholder="send test to…" style="max-width:220px">
          <button class="btn" id="testEmailBtn" type="button"><i data-lucide="send"></i><span>Send test</span></button>
          <button class="btn" id="emCheckBtn" type="button"><i data-lucide="plug-zap"></i><span>Check connection</span></button>
          <span id="emMsg" class="small"></span>
        </div>
        <p class="small muted" style="margin:10px 0 0">“Send test” checks the values shown above — you don’t need to Save first. Leave the password blank to use the saved one.</p>
      </div>`;
    icons();

    // Diagnose the SAVED SMTP config (what forgot-password / verification actually use):
    // shows enabled/host/port/auth state + a live connect-and-login result. Auto-runs on
    // open so the real status is visible without sending anything.
    const runEmailDiag = async () => {
      const box = $("emDiag"); if (!box) return;
      box.style.color = "var(--muted)"; box.textContent = "Checking the saved SMTP connection…";
      try {
        const d = await IAM.verifyEmailConfig();
        if (!d.saved) { box.style.color = "#b23b2e"; box.innerHTML = "✗ No SMTP host saved yet — fill in the form and click <strong>Save email settings</strong>."; return; }
        const ok = d.verify && d.verify.ok;
        const rows = [
          d.enabled ? "✓ Email sending is <strong>ON</strong>"
                    : "✗ Email sending is <strong>OFF</strong> — tick “Enable email sending” then <strong>Save</strong>, or no real emails go out (even if “Send test” works).",
          `Server: <strong>${esc(d.host)}:${esc(String(d.port))}</strong> ${d.secure ? "(SSL/TLS)" : "(STARTTLS)"}`,
          `Login: <strong>${esc(d.user || "— none set —")}</strong> · password saved: <strong>${d.hasPassword ? "yes" : "no"}</strong>`,
          `From: <strong>${esc(d.fromEmail || "—")}</strong>`,
          ok ? '<strong style="color:#1a8a4a">✓ Connection + login to the mail server SUCCEEDED.</strong>'
             : `<strong style="color:#b23b2e">✗ Connection / login FAILED: ${esc((d.verify && d.verify.error) || "unknown error")}</strong>`
        ];
        box.style.color = "var(--ink,#17201d)";
        box.innerHTML = rows.join("<br>");
      } catch (ex) {
        box.style.color = "#b23b2e"; box.textContent = "✗ Could not run the check: " + (ex.message || ex);
      }
    };
    runEmailDiag();
    $("emCheckBtn").onclick = runEmailDiag;

    $("saveEmailBtn").onclick = async () => {
      const cfg = {
        enabled: $("emEnabled").checked, host: $("emHost").value.trim(), port: Number($("emPort").value) || 587,
        secure: $("emSecure").checked, user: $("emUser").value.trim(), password: $("emPass").value,
        fromName: $("emFromName").value.trim(), fromEmail: $("emFromEmail").value.trim()
      };
      try { await IAM.saveEmailConfig(cfg); toast("Email settings saved."); renderSettings(); }
      catch (ex) { toast(ex.message, "bad"); }
    };
    $("testEmailBtn").onclick = async () => {
      const msg = $("emMsg"); msg.style.color = "var(--muted)"; msg.textContent = "Sending…";
      const to = $("emTestTo").value.trim();
      if (!to) { msg.style.color = "#b23b2e"; msg.textContent = "Enter a recipient email."; return; }
      // Test the values CURRENTLY in the form — no save-first needed. A blank password
      // means "use the saved one" (the field is masked).
      const config = {
        enabled: $("emEnabled").checked, host: $("emHost").value.trim(), port: Number($("emPort").value) || 587,
        secure: $("emSecure").checked, user: $("emUser").value.trim(), password: $("emPass").value,
        fromName: $("emFromName").value.trim(), fromEmail: $("emFromEmail").value.trim()
      };
      try { await IAM.testEmail(to, config); msg.style.color = "#1a8a4a"; msg.textContent = "✓ Test email sent."; }
      catch (ex) { msg.style.color = "#b23b2e"; msg.textContent = "✗ " + ex.message; }
    };
  }

  /* ---- Create / edit user + reset password ----------------------------- */
  // Build <option>s from the global role catalog (IAM.globalRoles()). `selected`
  // is the current role name; opts.hideElevated drops SUPERADMIN/ADMIN (used when
  // the actor isn't a Super Admin, since those roles confer portal authority).
  // Ladder labels for the per-app picker's <optgroup>s.
  const TIER_LABEL = { 1: "L1 · Super Admin", 2: "L2 · Admin", 3: "L3 · Director", 4: "L4 · Manager", 5: "L5 · Executive / Engineer", 6: "L6 · Project Executive", 7: "L7 · Supervisor", 8: "L8 · Technician / Operator", 9: "L9 · Mill Executive", 10: "L10 · Client", 11: "L11 · New User" };
  function roleOptionsHtml(selected, opts) {
    const o = opts || {};
    let roles = o.roles || (IAM.globalRoles && IAM.globalRoles()) || [];
    if (!roles.length) {
      roles = [["NEW_USER", "New User"], ["ORDINARY_USER", "Ordinary User"], ["DIRECTOR", "Director"], ["ADMIN", "Admin"], ["SUPERADMIN", "Super Admin"]].map(([name, label], i) => ({ name, label, rank: i }));
    }
    roles = roles.filter((r) => !(o.hideElevated && (r.name === "SUPERADMIN" || r.name === "ADMIN")));
    const opt = (r) => `<option value="${esc(r.name)}" ${selected === r.name ? "selected" : ""}>${esc(r.label)}</option>`;
    if (o.group) {
      const byTier = {};
      roles.forEach((r) => { const t = r.tier || 99; (byTier[t] = byTier[t] || []).push(r); });
      return Object.keys(byTier).sort((a, b) => a - b)
        .map((t) => `<optgroup label="${esc(TIER_LABEL[t] || ("Tier " + t))}">${byTier[t].map(opt).join("")}</optgroup>`)
        .join("");
    }
    return roles.map(opt).join("");
  }
  // Display label for a global role name.
  function roleLabel(name) {
    const r = ((IAM.globalRoles && IAM.globalRoles()) || []).find((x) => x.name === name);
    return r ? r.label : (name || "—");
  }

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
      <label class="field"><span>Phone number <small class="muted" style="font-weight:600">(optional)</small></span><input id="cuPhone" type="tel" autocomplete="off" placeholder="e.g. +60 12-345 6789"></label>
      <label class="field"><span>Temporary password</span><input id="cuPass" type="text" minlength="6" required value="${esc(randomPassword())}"></label>
      <label class="field"><span>Role</span><select id="cuRole" class="select">
        ${roleOptionsHtml("NEW_USER", { hideElevated: !canSuper })}</select>
        <small class="muted">${canSuper ? "Super Admin &amp; Admin also grant portal-administration rights." : "Administrative roles are Super-Admin-only."}</small></label>
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
          phone: $("cuPhone").value.trim(),
          password: $("cuPass").value,
          globalRole: $("cuRole").value || "NEW_USER"
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
        <label class="field"><span>User ID</span><input id="euId" type="text" value="${esc(u.userCode || "—")}" readonly title="Human-readable User ID (read-only)" style="opacity:.7;cursor:text"></label>
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
    // Wire controls once.
    if (!$("auditView").dataset.bound) {
      $("auditView").dataset.bound = "1";
      $("auActionFilter").addEventListener("change", () => { auAction = $("auActionFilter").value; auOffset = 0; renderAudit(); });
      $("auAppFilter").addEventListener("change", () => { auApp = $("auAppFilter").value; auOffset = 0; renderAudit(); });
      $("auSearch").addEventListener("input", () => { auQuery = $("auSearch").value.trim(); auOffset = 0; clearTimeout(auSearchT); auSearchT = setTimeout(renderAudit, 250); });
      $("auExport").addEventListener("click", exportAuditCsv);
      $("auAppFilter").innerHTML = `<option value="all">All apps</option>` + apps.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("");
    }
    $("auActionFilter").value = auAction; $("auAppFilter").value = auApp; $("auSearch").value = auQuery;

    let res;
    try { res = await IAM.listAudit({ q: auQuery, action: auAction, appId: auApp, limit: AU_PAGE, offset: auOffset }); }
    catch (ex) { $("auditTable").innerHTML = `<tbody><tr><td>${esc(ex.message)}</td></tr></tbody>`; return; }
    auRows = res.items || []; auTotal = res.total || 0;

    // Populate the action filter once from the distinct action list.
    if (res.actions && $("auActionFilter").options.length <= 1) {
      $("auActionFilter").innerHTML = `<option value="all">All actions</option>` + res.actions.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join("");
      $("auActionFilter").value = auAction;
    }

    const fmt = fmtDateTime;
    const clip = (d) => { const s = d ? (typeof d === "string" ? d : JSON.stringify(d)) : ""; return s.length > 80 ? s.slice(0, 80) + "…" : s; };
    $("auditTable").innerHTML = `<thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Target</th><th>App</th><th>Detail</th></tr></thead><tbody>${
      auRows.map((r) => `<tr data-au-row="${esc(r.id)}" style="cursor:pointer">
        <td><small>${fmt(r.createdAt)}</small></td>
        <td><span class="badge">${esc(r.action)}</span></td>
        <td><small>${esc(r.actor || "—")}</small></td>
        <td><small>${esc(r.target || "—")}</small></td>
        <td><small class="muted">${esc(r.appId || "—")}</small></td>
        <td><small class="muted">${esc(clip(r.detail))}</small></td>
      </tr>`).join("") || `<tr><td colspan="6" class="muted" style="padding:18px">No audit entries${auQuery || auAction !== "all" || auApp !== "all" ? " for this filter" : " yet"}.</td></tr>`
    }</tbody>`;
    $("auditTable").onclick = (e) => { const tr = e.target.closest("[data-au-row]"); if (tr) { const row = auRows.find((x) => x.id === tr.dataset.auRow); if (row) openAuditDetail(row); } };

    // Pager.
    const from = auTotal ? auOffset + 1 : 0, to = Math.min(auOffset + AU_PAGE, auTotal);
    $("auPager").innerHTML = `<span class="muted small">${from}–${to} of ${auTotal}</span>
      <button class="btn ghost sm" id="auPrev" type="button" ${auOffset <= 0 ? "disabled" : ""}><i data-lucide="chevron-left"></i><span>Prev</span></button>
      <button class="btn ghost sm" id="auNext" type="button" ${to >= auTotal ? "disabled" : ""}><span>Next</span><i data-lucide="chevron-right"></i></button>`;
    $("auPrev").onclick = () => { if (auOffset > 0) { auOffset = Math.max(0, auOffset - AU_PAGE); renderAudit(); } };
    $("auNext").onclick = () => { if (auOffset + AU_PAGE < auTotal) { auOffset += AU_PAGE; renderAudit(); } };
    icons();
  }

  // Read-only detail of one audit entry (full metadata + pretty JSON) in the shared modal.
  function openAuditDetail(r) {
    const fmt = fmtDateTime;
    const row = (label, val) => `<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--line,#2a2a2a)"><span class="muted small" style="min-width:64px;flex:0 0 auto">${label}</span><div>${val}</div></div>`;
    $("drawerTitle").textContent = "Audit entry";
    $("drawerBody").innerHTML = `<div>
      ${row("When", esc(fmt(r.createdAt)))}
      ${row("Action", `<span class="badge">${esc(r.action)}</span>`)}
      ${row("Actor", esc(r.actor || "—"))}
      ${row("Target", esc(r.target || "—"))}
      ${row("App", esc(r.appId || "—"))}
      ${row("Company", esc(r.companyId || "—"))}
      <div style="margin-top:12px"><span class="muted small">Detail</span>
        <pre style="white-space:pre-wrap;word-break:break-word;border:1px solid var(--line,#2a2a2a);border-radius:8px;padding:10px;margin:4px 0 0;background:var(--surface-soft,rgba(255,255,255,.03));font-size:12px;overflow:auto">${esc(r.detail ? (typeof r.detail === "string" ? r.detail : JSON.stringify(r.detail, null, 2)) : "—")}</pre></div>
    </div>`;
    $("drawerBackdrop").hidden = false; icons();
  }

  // Export the current audit filter as CSV (up to 1000 rows).
  async function exportAuditCsv() {
    let res;
    try { res = await IAM.listAudit({ q: auQuery, action: auAction, appId: auApp, limit: 1000, offset: 0 }); }
    catch (ex) { toast(ex.message, "bad"); return; }
    const rows = res.items || [];
    if (!rows.length) { toast("No audit entries to export.", "bad"); return; }
    const cols = ["createdAt", "action", "actor", "target", "appId", "companyId", "detail"];
    const escCsv = (v) => { const s = v == null ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v)); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [cols.join(",")].concat(rows.map((r) => cols.map((c) => escCsv(r[c])).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "audit-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast("Exported " + rows.length + " rows.");
  }

  /* ---- Feedback Center (all apps' feedback) ----------------------------- */
  const FB_CAT = { general: "General", bug: "Bug", idea: "Idea", complaint: "Complaint" };
  const appName = (id) => (apps.find((a) => a.id === id) || {}).name || id;

  async function renderFeedback() {
    // Populate the app filter once from the catalog.
    const sel = $("fbAppFilter");
    if (sel.options.length <= 1) {
      sel.innerHTML = `<option value="all">All apps</option>` + apps.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("");
    }
    // Wire controls once.
    if (!$("feedbackView").dataset.bound) {
      $("feedbackView").dataset.bound = "1";
      sel.addEventListener("change", () => { fbApp = sel.value; renderFeedback(); });
      $("fbStatusFilter").addEventListener("change", () => { fbStatus = $("fbStatusFilter").value; renderFeedback(); });
      if ($("fbSearch")) $("fbSearch").addEventListener("input", () => { fbQuery = $("fbSearch").value.trim(); clearTimeout(fbSearchT); fbSearchT = setTimeout(renderFeedback, 250); });
      if ($("fbExport")) $("fbExport").addEventListener("click", exportFeedbackCsv);
      $("newFeedbackBtn").addEventListener("click", openFeedbackDrawer);
    }
    sel.value = fbApp; $("fbStatusFilter").value = fbStatus; if ($("fbSearch")) $("fbSearch").value = fbQuery;

    let rows;
    try { rows = await IAM.listFeedback({ app: fbApp, status: fbStatus, q: fbQuery }); }
    catch (ex) { $("feedbackTable").innerHTML = `<tbody><tr><td>${esc(ex.message)}</td></tr></tbody>`; return; }
    fbRows = rows;

    // Stat cards (status counts over the current filter).
    const c = { new: 0, reviewed: 0, resolved: 0 };
    rows.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    const card = (label, n, icon, cls) => `<div class="stat-card ${cls || ""}"><span class="stat-ic"><i data-lucide="${icon}"></i></span><div><strong>${n}</strong><small>${label}</small></div></div>`;
    $("feedbackStats").innerHTML =
      card("Total", rows.length, "message-square", "total") +
      card("New", c.new || 0, "inbox", c.new ? "warn" : "") +
      card("Reviewed", c.reviewed || 0, "eye", "") +
      card("Resolved", c.resolved || 0, "check-circle", "");

    const fmt = fmtDateTime;
    const canAdmin = IAM.isPortalAdmin();
    const stars = (n) => n ? "★".repeat(n) + "☆".repeat(5 - n) : "";
    const statusCell = (r) => canAdmin
      ? `<select class="select sm" data-fb-status="${esc(r.id)}">${["new", "reviewed", "resolved"].map((s) => `<option value="${s}" ${r.status === s ? "selected" : ""}>${s[0].toUpperCase() + s.slice(1)}</option>`).join("")}</select>`
      : `<span class="badge ${r.status === "resolved" ? "ok" : r.status === "reviewed" ? "" : "warn"}">${r.status}</span>`;

    const clip = (s) => { s = String(s || ""); return s.length > 90 ? s.slice(0, 90) + "…" : s; };
    $("feedbackTable").innerHTML = `<thead><tr><th>App</th><th>From</th><th>Category</th><th>Feedback</th><th>Rating</th><th>Status</th><th>When</th></tr></thead><tbody>${
      rows.map((r) => `<tr data-fb-row="${esc(r.id)}" style="cursor:pointer">
        <td><span class="badge">${esc(appName(r.appId))}</span></td>
        <td><strong>${esc(r.name || "—")}</strong><small class="muted">${esc(r.email || "")}</small></td>
        <td>${esc(FB_CAT[r.category] || r.category)}</td>
        <td>${esc(clip(r.message))}${r.pageUrl ? `<small class="muted" style="display:block">${esc(r.pageUrl)}</small>` : ""}</td>
        <td title="${r.rating || ""}"><span class="stars">${stars(r.rating)}</span></td>
        <td>${statusCell(r)}</td>
        <td><small>${fmt(r.createdAt)}</small></td>
      </tr>`).join("") || `<tr><td colspan="7" class="muted" style="padding:18px">No feedback${fbApp !== "all" || fbStatus !== "all" || fbQuery ? " for this filter" : " yet"}.</td></tr>`
    }</tbody>`;
    $("feedbackTable").onchange = async (e) => {
      const ss = e.target.closest("[data-fb-status]");
      if (ss) { try { await IAM.setFeedbackStatus(ss.dataset.fbStatus, ss.value); toast("Status updated."); const row = fbRows.find((x) => x.id === ss.dataset.fbStatus); if (row) row.status = ss.value; } catch (ex) { toast(ex.message, "bad"); } }
    };
    $("feedbackTable").onclick = (e) => {
      if (e.target.closest("[data-fb-status]")) return; // clicking the status dropdown isn't a detail click
      const tr = e.target.closest("[data-fb-row]");
      if (tr) { const row = fbRows.find((x) => x.id === tr.dataset.fbRow); if (row) openFeedbackDetail(row); }
    };
    icons();
  }

  // Read-only detail of one feedback item (full message + metadata) in the shared modal.
  function openFeedbackDetail(r) {
    const stars = (n) => n ? "★".repeat(n) + "☆".repeat(5 - n) : "—";
    const fmt = fmtDateTime;
    const row = (label, val) => `<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--line,#2a2a2a)"><span class="muted small" style="min-width:74px;flex:0 0 auto">${label}</span><div>${val}</div></div>`;
    $("drawerTitle").textContent = "Feedback detail";
    $("drawerBody").innerHTML = `<div>
      ${row("App", esc(appName(r.appId)))}
      ${row("From", `<strong>${esc(r.name || "—")}</strong> <small class="muted">${esc(r.email || "")}</small>`)}
      ${row("Category", esc(FB_CAT[r.category] || r.category))}
      ${row("Rating", `<span class="stars">${stars(r.rating)}</span>`)}
      ${row("Status", esc(r.status))}
      ${row("When", fmt(r.createdAt))}
      ${r.pageUrl ? row("Page", `<code>${esc(r.pageUrl)}</code>`) : ""}
      <div style="margin-top:12px"><span class="muted small">Message</span>
        <div style="white-space:pre-wrap;border:1px solid var(--line,#2a2a2a);border-radius:8px;padding:10px;margin-top:4px;background:var(--panel,rgba(255,255,255,.03))">${esc(r.message)}</div></div>
    </div>`;
    $("drawerBackdrop").hidden = false; icons();
  }

  // Export the currently-loaded (filtered) feedback rows as CSV.
  function exportFeedbackCsv() {
    if (!fbRows.length) { toast("No feedback to export.", "bad"); return; }
    const cols = ["createdAt", "appId", "name", "email", "category", "rating", "status", "pageUrl", "message"];
    const escCsv = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [cols.join(",")].concat(fbRows.map((r) => cols.map((c) => escCsv(r[c])).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "feedback-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast("Exported " + fbRows.length + " rows.");
  }

  // Send-feedback form (uses the shared draggable modal). Recorded centrally.
  function openFeedbackDrawer() {
    $("drawerTitle").textContent = "Send feedback";
    $("drawerBody").innerHTML = `<form class="form" id="feedbackForm">
      <p class="muted small">Your feedback is recorded in the central Feedback Center.</p>
      <label class="field"><span>App</span><select id="fbApp" class="select">${apps.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("")}<option value="portal">User Management Portal</option></select></label>
      <label class="field"><span>Category</span><select id="fbCat" class="select">${Object.keys(FB_CAT).map((k) => `<option value="${k}">${FB_CAT[k]}</option>`).join("")}</select></label>
      <label class="field"><span>Rating (optional)</span><select id="fbRating" class="select"><option value="">— none —</option>${[5,4,3,2,1].map((n) => `<option value="${n}">${"★".repeat(n)} (${n})</option>`).join("")}</select></label>
      <label class="field"><span>Message</span><textarea id="fbMsg" rows="4" required></textarea></label>
      <p id="fbError" class="error" role="alert" hidden></p>
      <button class="btn primary block" type="submit"><i data-lucide="send"></i><span>Submit feedback</span></button>
    </form>`;
    $("drawerBackdrop").hidden = false; icons();
    $("fbMsg").focus();
    $("feedbackForm").onsubmit = async (e) => {
      e.preventDefault();
      const err = $("fbError"); err.hidden = true;
      const message = $("fbMsg").value.trim();
      if (!message) { err.textContent = "Please enter a message."; err.hidden = false; return; }
      try {
        await IAM.submitFeedback({ app: $("fbApp").value, category: $("fbCat").value, rating: Number($("fbRating").value) || null, message });
        closeDrawer(); toast("Thanks — feedback submitted.");
        if (!$("feedbackView").hidden) renderFeedback();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    };
  }

  /* ---- User & Apps (superadmin) — entitlements -------------------------- */
  async function renderAppsRoles() {
    const users = (await IAM.listUsers({})).filter((u) => u.status === "active");
    const summary = (u, appId) => {
      const e = u.entitlements.find((x) => x.appId === appId);
      if (!e) return `<span class="muted">—</span>`;
      const tags = [e.isAppAdmin ? "App Admin" : "Member"];
      if (e.canApproveDeletions) tags.push("Del");
      return `<span class="badge ${e.isAppAdmin ? "full" : "ok"}">${tags.join(" · ")}</span>`;
    };
    $("appsRolesTable").innerHTML = `<thead><tr><th>User</th>${apps.map((a) => `<th title="${esc(a.name)}">${esc(a.shortName || a.name)}</th>`).join("")}<th></th></tr></thead><tbody>${
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
        ? "Assign which apps this user may use, who administers each app, and who may approve deletions. App admins then assign companies (in Company & App Roles)."
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

  /* ---- Company Access — set up an app's companies + assign user access --- */
  // Portal admins/superadmins pick ANY app and choose which companies it serves
  // (the relocated "App availability"). App admins of that app then assign each
  // entitled user's access level. Each control is shown only to the role that
  // the backend allows: setAppCompany→portal admin, setCompanyAccess→app admin.
  async function renderCompanyAccess() {
    const canEnable = IAM.isPortalAdmin();               // may set up app⇄company links
    const myAdminApps = IAM.appsIAdminister();           // apps this user administers
    const pickerApps = canEnable ? apps.map((a) => a.id) : myAdminApps;
    if (!currentApp || !pickerApps.includes(currentApp)) currentApp = pickerApps[0] || null;

    $("appPicker").innerHTML = pickerApps.map((id) => {
      const a = apps.find((x) => x.id === id) || { name: id, icon: "box" };
      // Prefer the short name in the cramped chip; full name as the tooltip.
      return `<button class="chip ${id === currentApp ? "is-active" : ""}" data-app="${esc(id)}" type="button" title="${esc(a.name)}"><i data-lucide="${esc(a.icon)}"></i><span>${esc(a.shortName || a.name)}</span></button>`;
    }).join("");
    $("appPicker").onclick = (e) => { const b = e.target.closest("[data-app]"); if (b) { currentApp = b.dataset.app; renderCompanyAccess(); } };

    if (!currentApp) { $("appCompaniesPanel").innerHTML = ""; $("companyAccessTable").innerHTML = ""; icons(); return; }

    const appName = (apps.find((a) => a.id === currentApp) || {}).name || currentApp;
    const canAssign = myAdminApps.includes(currentApp);  // app admin of THIS app (or super)

    // --- Enable panel: which companies this app is set up for (portal admin only) ---
    if (canEnable) {
      companies = await IAM.listCompanies().catch(() => companies);
      const links = await IAM.appCompanyLinks();
      const onApp = (companyId) => links.some((l) => l.appId === currentApp && l.companyId === companyId);
      $("appCompaniesPanel").innerHTML = `
        <div class="cos-enable">
          <div class="cos-enable-head"><strong>Companies set up for ${esc(appName)}</strong><small class="muted">Tick a company to make it available in this app. Unticking also removes any access granted there.</small></div>
          <div class="cos-enable-list">${
            companies.map((c) => `<label class="cos-check${c.status === "active" ? "" : " is-off"}"><input type="checkbox" data-company="${esc(c.id)}" ${onApp(c.id) ? "checked" : ""}><span>${esc(c.name)}${c.status === "active" ? "" : " (inactive)"}</span></label>`).join("") || `<span class="muted small">No companies yet — create one on the Companies page.</span>`
          }</div>
        </div>`;
      $("appCompaniesPanel").onchange = async (e) => {
        const box = e.target.closest("input[data-company]"); if (!box) return;
        try { await IAM.setAppCompany(currentApp, box.dataset.company, box.checked); toast(box.checked ? "Company added to app." : "Company removed from app."); renderCompanyAccess(); }
        catch (ex) { toast(ex.message, "bad"); box.checked = !box.checked; }
      };
    } else {
      $("appCompaniesPanel").innerHTML = "";
    }

    // --- Access grid: assign each entitled user's level (app admin of this app) ---
    const appCos = await IAM.listAppCompanies(currentApp);
    if (appCos.length === 0) {
      $("companyAccessTable").innerHTML = `<tbody><tr><td class="muted" style="padding:18px">${
        canEnable ? "Tick a company above to set it up for this app." : "No companies are set up for this app yet. A Super Admin or Portal Admin enables companies for this app here."
      }</td></tr></tbody>`;
      icons(); return;
    }
    if (!canAssign) {
      // Portal-admin-only viewing an app they don't administer: setup only, no role edits.
      $("companyAccessTable").innerHTML = `<tbody><tr><td class="muted" style="padding:18px">Each app's admin assigns user roles here.</td></tr></tbody>`;
      icons(); return;
    }
    const users = (await IAM.listUsers({})).filter((u) => u.status === "active" && u.entitlements.some((e) => e.appId === currentApp));
    // A per-company ROLE picker: global roles + THIS app's scoped titles (e.g.
    // "Project Manager"), grouped by ladder tier, with a leading "No Access" option.
    const appRoles = await IAM.rolesForApp(currentApp);
    const roleOpts = (cur) => `<option value="none"${(!cur || cur === "none") ? " selected" : ""}>No Access</option>` + roleOptionsHtml(cur, { roles: appRoles, group: true });

    $("companyAccessTable").innerHTML = `<thead><tr><th>User</th>${appCos.map((c) => `<th>${esc(c.name)}</th>`).join("")}</tr></thead><tbody>${
      users.map((u) => {
        const ent = u.entitlements.find((e) => e.appId === currentApp);
        const cells = appCos.map((c) => {
          const cur = (ent.companies.find((x) => x.companyId === c.id) || {}).role || "none";
          return `<td><select class="select sm" data-user="${esc(u.id)}" data-company="${esc(c.id)}" aria-label="${esc(c.name)} role for ${esc(u.fullName)}">${roleOpts(cur)}</select></td>`;
        }).join("");
        return `<tr><th scope="row"><strong>${esc(u.fullName)}</strong>${ent.isAppAdmin ? ' <span class="badge full">App Admin</span>' : ""}<small>${esc(u.email)}</small></th>${cells}</tr>`;
      }).join("") || `<tr><td colspan="${appCos.length + 1}" class="muted" style="padding:18px">No users are entitled to this app yet. A Super Admin assigns apps in “User & Apps”.</td></tr>`
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

  /* ---- Company Setup (PSM-style: stat cards + table + Add/Edit modal) ---- */
  async function renderCompanies() {
    const canAdmin = IAM.isPortalAdmin();
    $("newCompanyBtn").hidden = !canAdmin;
    companies = await IAM.listCompanies();

    // Summary stat cards.
    const total = companies.length;
    const active = companies.filter((c) => c.status === "active").length;
    const card = (label, n, icon) => `<div class="stat-card"><span class="stat-ic"><i data-lucide="${icon}"></i></span><div><strong>${n}</strong><small>${label}</small></div></div>`;
    $("companyStats").innerHTML = card("Total companies", total, "building-2") + card("Active companies", active, "circle-check") + card("Inactive companies", total - active, "circle-minus");

    // PSM-style table.
    const oneLine = (a) => esc(String(a || "").split("\n").map((x) => x.trim()).filter(Boolean).join(", "));
    const dash = '<span class="muted">—</span>';
    $("companiesTable").innerHTML = `<thead><tr>
        <th>Company ID</th><th>Company name</th><th>SSM reg</th><th>Address</th><th>Email</th><th>Phone</th><th>Status</th><th>Active users</th><th>Inactive users</th>${canAdmin ? "<th>Actions</th>" : ""}
      </tr></thead><tbody>${
      companies.map((c) => `<tr>
        <td>${c.companyCode ? `<code class="uid">${esc(c.companyCode)}</code>` : dash}</td>
        <td><strong>${esc(c.name)}</strong><small class="muted" style="display:block">${esc(c.slug)}</small></td>
        <td>${c.regNo ? esc(c.regNo) : dash}</td>
        <td>${c.address ? oneLine(c.address) : dash}</td>
        <td>${c.email ? esc(c.email) : dash}</td>
        <td>${c.phone ? esc(c.phone) : dash}</td>
        <td><span class="badge ${c.status === "active" ? "ok" : "off"}">${esc(c.status)}</span></td>
        <td><strong>${c.activeUsers ?? 0}</strong></td>
        <td>${c.inactiveUsers ?? 0}</td>
        ${canAdmin ? `<td class="actions">
          <button class="btn ghost sm" data-edit-co="${esc(c.id)}"><i data-lucide="pencil"></i><span>Edit</span></button>
          <button class="btn ghost sm" data-toggle-co="${esc(c.id)}" data-status="${esc(c.status)}">${c.status === "active" ? "Deactivate" : "Activate"}</button>
        </td>` : ""}
      </tr>`).join("") || `<tr><td colspan="${canAdmin ? 10 : 9}" class="muted" style="padding:18px">No companies yet. Click “Add company”.</td></tr>`
    }</tbody>`;
    icons();

    if (canAdmin) {
      $("companiesTable").onclick = async (e) => {
        const ed = e.target.closest("[data-edit-co]");
        if (ed) { return openCompanyDrawer(companies.find((x) => x.id === ed.dataset.editCo)); }
        const tg = e.target.closest("[data-toggle-co]");
        if (tg) {
          const next = tg.dataset.status === "active" ? "inactive" : "active";
          try { await IAM.updateCompany(tg.dataset.toggleCo, { status: next }); toast("Company " + next + "."); renderCompanies(); }
          catch (ex) { toast(ex.message, "bad"); }
        }
      };
    }
  }

  /* ---- Organize Apps (app catalog) ------------------------------------- */
  async function renderApps() {
    $("newAppBtn").hidden = !IAM.isPortalAdmin();
    apps = await IAM.listApps();
    const canAdmin = IAM.isPortalAdmin();
    const canSuper = IAM.isSuperAdmin();
    const liveCell = (a) => {
      const on = a.active !== false;
      if (!canAdmin) return `<span class="badge ${on ? "ok" : "off"}">${on ? "Live" : "Off"}</span>`;
      return `<label class="switch"><input type="checkbox" data-live-app="${esc(a.id)}" ${on ? "checked" : ""}><span>${on ? "Live" : "Off"}</span></label>`;
    };
    // Super-Admin-only per-app maintenance toggle (blocks non-admins everywhere).
    const maintCell = (a) => {
      const on = !!a.maintenanceMode;
      return `<label class="switch"><input type="checkbox" data-maint-app="${esc(a.id)}" ${on ? "checked" : ""}><span>${on ? "On" : "Off"}</span></label>`;
    };
    $("appsTable").innerHTML = `<thead><tr><th>Icon</th><th>App ID</th><th>Name</th><th>Short name</th><th>Live</th>${canSuper ? "<th>Maintenance</th>" : ""}${canAdmin ? "<th>Actions</th>" : ""}</tr></thead><tbody>${
      apps.map((a) => `<tr class="${a.active === false ? "is-off" : ""}">
        <td><span class="app-ic"><i data-lucide="${esc(a.icon || "box")}"></i></span></td>
        <td><code class="uid">${esc(a.id)}</code></td>
        <td><strong>${esc(a.name)}</strong>${a.maintenanceMode ? ' <span class="badge warn">Maintenance</span>' : ""}</td>
        <td>${a.shortName ? esc(a.shortName) : `<span class="muted">—</span>`}</td>
        <td>${liveCell(a)}</td>
        ${canSuper ? `<td>${maintCell(a)}</td>` : ""}
        ${canAdmin ? `<td class="actions"><button class="btn ghost sm" data-edit-app="${esc(a.id)}"><i data-lucide="pencil"></i><span>Edit</span></button>${canSuper ? `<button class="btn ghost sm" data-del-app="${esc(a.id)}" title="Delete app"><i data-lucide="trash-2"></i></button>` : ""}</td>` : ""}
      </tr>`).join("") || `<tr><td colspan="7" class="muted" style="padding:18px">No apps.</td></tr>`
    }</tbody>`;
    $("appsTable").onclick = async (e) => {
      const ed = e.target.closest("[data-edit-app]");
      if (ed) return openAppDrawer(apps.find((a) => a.id === ed.dataset.editApp));
      const dl = e.target.closest("[data-del-app]");
      if (dl) {
        const a = apps.find((x) => x.id === dl.dataset.delApp) || {};
        if (!confirm(`Delete "${a.name || dl.dataset.delApp}" from the catalog?\n\nThis removes the app and everyone's access to it. This can't be undone.`)) return;
        try { await IAM.deleteApp(dl.dataset.delApp); toast("App deleted."); renderApps(); }
        catch (ex) { toast(ex.message, "bad"); }
      }
    };
    // Toggle an app live/off — or into/out of maintenance — directly from the table.
    $("appsTable").onchange = async (e) => {
      const lv = e.target.closest("[data-live-app]");
      if (lv) {
        try { await IAM.updateApp(lv.dataset.liveApp, { active: lv.checked }); toast(lv.checked ? "App is now live." : "App taken offline."); renderApps(); }
        catch (ex) { toast(ex.message, "bad"); lv.checked = !lv.checked; }
        return;
      }
      const mt = e.target.closest("[data-maint-app]");
      if (mt) {
        const a = apps.find((x) => x.id === mt.dataset.maintApp) || {};
        try { await IAM.setAppMaintenance(mt.dataset.maintApp, mt.checked, a.maintenanceMessage || ""); toast(mt.checked ? "App put into maintenance." : "App back online."); renderApps(); }
        catch (ex) { toast(ex.message, "bad"); mt.checked = !mt.checked; }
      }
    };
    icons();
  }

  function openAppDrawer(app) {
    const editing = !!app;
    $("drawerTitle").textContent = editing ? "Edit app — " + app.name : "New app";
    $("drawerBody").innerHTML = `<form class="form" id="appForm">
      <p class="muted small">${editing ? "Update this app's display details. The App ID can't be changed." : "Register an app in the platform catalog. The App ID is auto-assigned from the name."}</p>
      <label class="field"><span>Full name</span><input id="apName" class="input" value="${editing ? esc(app.name) : ""}" placeholder="e.g. Tex Cycle Biomass Power Plant" required></label>
      <label class="field"><span>App ID <small class="muted">(auto-assigned, permanent)</small></span>
        <input id="apId" class="input" value="${editing ? esc(app.id) : ""}" readonly style="opacity:.7" placeholder="—">
        ${editing ? "" : `<small class="muted">First letter of each word (up to 6) + a 2-digit series number. The app opens at <code id="apIdUrl" class="uid">/…</code>.</small>`}
      </label>
      <label class="field"><span>Short name</span><input id="apShort" class="input" value="${editing && app.shortName ? esc(app.shortName) : ""}" placeholder="e.g. PSM"></label>
      <label class="field"><span>Icon (lucide name) <i id="apIconPrev" data-lucide="${editing ? esc(app.icon || "box") : "box"}" style="width:16px;height:16px;vertical-align:middle"></i></span><input id="apIcon" class="input" value="${editing ? esc(app.icon || "box") : "box"}" placeholder="e.g. shopping-cart"></label>
      <label class="switch" style="margin:4px 0"><input type="checkbox" id="apActive" ${editing ? (app.active !== false ? "checked" : "") : "checked"}><span>Live <small class="muted">(show this app in the launcher)</small></span></label>
      ${editing && IAM.isSuperAdmin() ? `
      <hr style="border:none;border-top:1px solid var(--line,#2a2a2a);margin:10px 0 6px">
      <label class="switch" style="margin:4px 0"><input type="checkbox" id="apMaint" ${app.maintenanceMode ? "checked" : ""}><span>Maintenance mode <small class="muted">(block non-admins from this app)</small></span></label>
      <label class="field"><span>Maintenance message</span><textarea id="apMaintMsg" class="input" rows="2" placeholder="e.g. ${esc(app.name)} is down for scheduled maintenance.">${app.maintenanceMessage ? esc(app.maintenanceMessage) : ""}</textarea></label>` : ""}
      <p id="apError" class="error" role="alert" hidden></p>
      <button class="btn primary block" type="submit"><i data-lucide="save"></i><span>${editing ? "Save changes" : "Create app"}</span></button>
    </form>`;
    $("drawerBackdrop").hidden = false; icons();
    $("apName").focus();
    // Live icon preview.
    $("apIcon").addEventListener("input", () => {
      const prev = $("apIconPrev");
      prev.setAttribute("data-lucide", $("apIcon").value.trim() || "box");
      prev.removeAttribute("data-processed"); prev.innerHTML = ""; icons();
    });
    // Auto-assign the App ID from the name (create only) + suggest the URL.
    if (!editing) {
      $("apName").addEventListener("input", () => {
        const id = deriveAppId($("apName").value);
        $("apId").value = id;
        $("apIdUrl").textContent = id ? "/" + id : "/…";
      });
    }
    $("appForm").onsubmit = async (e) => {
      e.preventDefault();
      const err = $("apError"); err.hidden = true;
      const id = editing ? app.id : $("apId").value.trim().toLowerCase();
      if (!editing && !/^[a-z]{1,6}[0-9]{2}$/.test(id)) {
        err.textContent = "Enter a full name so an App ID can be auto-assigned.";
        err.hidden = false; return;
      }
      const payload = { name: $("apName").value.trim(), shortName: $("apShort").value.trim(), icon: $("apIcon").value.trim() || "box", active: $("apActive").checked };
      if (!editing) payload.url = "/" + id; // proxied apps always launch at /<id>; the launcher derives this anyway
      try {
        if (editing) {
          await IAM.updateApp(id, payload);
          if (IAM.isSuperAdmin() && $("apMaint")) await IAM.setAppMaintenance(id, $("apMaint").checked, $("apMaintMsg").value.trim());
        } else {
          await IAM.createApp(Object.assign({ id }, payload));
        }
        closeDrawer(); toast(editing ? "App updated." : "App created.");
        await renderApps();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    };
  }

  // Create / edit a company (PSM Company Setup form) in the shared draggable modal.
  function openCompanyDrawer(company) {
    const editing = !!company;
    const c = company || {};
    const addr = String(c.address || "").split("\n");
    $("drawerTitle").textContent = editing ? ("Edit — " + c.name) : "Add company";
    $("drawerBody").innerHTML = `<form class="form" id="companyForm">
      <label class="field"><span>Company name</span><input id="coName" type="text" autocomplete="off" value="${esc(c.name || "")}" placeholder="e.g. True Eco Sdn Bhd" required></label>
      <label class="field"><span>SSM registration <small class="muted" style="font-weight:600">(optional)</small></span><input id="coReg" type="text" autocomplete="off" value="${esc(c.regNo || "")}" placeholder="Business registration no."></label>
      <div class="field"><span>Logo <small class="muted" style="font-weight:600">(printed on payslips / EA letterheads)</small></span>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <img id="coLogoImg" src="${esc(c.logo || "")}" alt="" style="max-height:48px;max-width:150px;object-fit:contain;border:1px solid var(--line,#2a2a2a);border-radius:8px;padding:4px;background:#fff;${c.logo ? "" : "display:none"}">
          <label class="btn"><span>Upload logo</span><input id="coLogoFile" type="file" accept="image/*" hidden></label>
          <button type="button" id="coLogoRemove" class="btn" style="${c.logo ? "" : "display:none"}">Remove</button>
        </div>
        <p id="coLogoErr" class="error" role="alert" hidden style="margin-top:6px"></p>
      </div>
      <input id="coAddr1" class="input" type="text" value="${esc(addr[0] || "")}" placeholder="Address line 1" style="margin-bottom:6px">
      <input id="coAddr2" class="input" type="text" value="${esc(c.address2 || addr[1] || "")}" placeholder="Address line 2" style="margin-bottom:6px">
      <div class="field-row">
        <label class="field"><span>Postcode</span><input id="coPost" type="text" autocomplete="off" value="${esc(c.postcode || "")}"></label>
        <label class="field"><span>City</span><input id="coCity" type="text" autocomplete="off" value="${esc(c.city || "")}"></label>
        <label class="field"><span>State</span><input id="coState" type="text" autocomplete="off" value="${esc(c.state || "")}"></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Contact email</span><input id="coEmail" type="email" autocomplete="off" value="${esc(c.email || "")}" placeholder="name@company.com"></label>
        <label class="field"><span>Contact phone</span><input id="coPhone" type="tel" autocomplete="off" value="${esc(c.phone || "")}" placeholder="+60 3-1234 5678"></label>
      </div>
      <label class="field"><span>Website</span><input id="coWeb" type="text" autocomplete="off" value="${esc(c.website || "")}" placeholder="www.company.com"></label>
      <div class="field"><span>Employer numbers <small class="muted" style="font-weight:600">(for the EA form / CP8D / EPF·SOCSO·EIS files)</small></span>
        <div class="field-row">
          <label class="field"><span>LHDN E-number</span><input id="coTax" type="text" autocomplete="off" value="${esc(c.incomeTaxNo || "")}" placeholder="E 1234567890"></label>
          <label class="field"><span>EPF (KWSP)</span><input id="coEpf" type="text" autocomplete="off" value="${esc(c.epfNo || "")}"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>SOCSO (PERKESO)</span><input id="coSocso" type="text" autocomplete="off" value="${esc(c.socsoNo || "")}"></label>
          <label class="field"><span>EIS</span><input id="coEis" type="text" autocomplete="off" value="${esc(c.eisNo || "")}"></label>
        </div>
      </div>
      <p id="coError" class="error" role="alert" hidden></p>
      <button class="btn primary block" type="submit"><i data-lucide="${editing ? "save" : "plus"}"></i><span>${editing ? "Update company" : "Create company"}</span></button>
    </form>`;
    $("drawerBackdrop").hidden = false; icons();
    $("coName").focus();

    // Logo: resize client-side to a small data URL. logoData: undefined = unchanged, null = removed, string = new.
    let logoData;
    $("coLogoFile").onchange = () => {
      const f = $("coLogoFile").files && $("coLogoFile").files[0];
      const lerr = $("coLogoErr"); lerr.hidden = true;
      if (!f) return;
      if (!f.type.startsWith("image/")) { lerr.textContent = "Please choose an image file (PNG, JPEG…)."; lerr.hidden = false; return; }
      if (f.size > 2 * 1024 * 1024) { lerr.textContent = "Image too large — please use one under 2 MB."; lerr.hidden = false; return; }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, 400 / Math.max(img.width, img.height));
          const cv = document.createElement("canvas");
          cv.width = Math.max(1, Math.round(img.width * scale));
          cv.height = Math.max(1, Math.round(img.height * scale));
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          let out = cv.toDataURL("image/png");
          if (out.length > 300000) out = cv.toDataURL("image/jpeg", 0.85);
          logoData = out;
          const im = $("coLogoImg"); im.src = out; im.style.display = "";
          $("coLogoRemove").style.display = "";
        };
        img.onerror = () => { lerr.textContent = "That file isn't a valid image."; lerr.hidden = false; };
        img.src = reader.result;
      };
      reader.readAsDataURL(f);
    };
    $("coLogoRemove").onclick = () => {
      logoData = null;
      const im = $("coLogoImg"); im.src = ""; im.style.display = "none";
      $("coLogoRemove").style.display = "none";
      $("coLogoFile").value = "";
    };

    $("companyForm").onsubmit = async (e) => {
      e.preventDefault();
      const err = $("coError"); err.hidden = true;
      const name = $("coName").value.trim();
      if (!name) { err.textContent = "Company name is required."; err.hidden = false; return; }
      const payload = {
        name,
        regNo: $("coReg").value.trim(),
        address: $("coAddr1").value.trim(),
        address2: $("coAddr2").value.trim(),
        postcode: $("coPost").value.trim(),
        city: $("coCity").value.trim(),
        state: $("coState").value.trim(),
        email: $("coEmail").value.trim(),
        phone: $("coPhone").value.trim(),
        website: $("coWeb").value.trim(),
        incomeTaxNo: $("coTax").value.trim(),
        epfNo: $("coEpf").value.trim(),
        socsoNo: $("coSocso").value.trim(),
        eisNo: $("coEis").value.trim()
      };
      if (logoData !== undefined) payload.logo = logoData; // only when changed/removed; else IAM keeps it
      try {
        if (editing) await IAM.updateCompany(c.id, payload);
        else await IAM.createCompany(payload);
        closeDrawer(); toast(editing ? "Company updated." : "Company created."); renderCompanies();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    };
  }

  // Personal settings for the signed-in user: profile + notifications + password.
  function openPersonalSettings() {
    const u = me.user;
    $("drawerTitle").textContent = "Personal settings";
    $("drawerBody").innerHTML = `
      <form class="form" id="profileForm">
        <h3 class="subhead" style="margin:0 0 2px">Profile</h3>
        <label class="field"><span>Full name</span><input id="psName" type="text" autocomplete="name" value="${esc(u.fullName || "")}" required></label>
        <label class="field"><span>Email</span><input type="email" value="${esc(u.email || "")}" disabled title="Contact an administrator to change your email"></label>
        <label class="field"><span>Phone number</span><input id="psPhone" type="tel" autocomplete="tel" value="${esc(u.phone || "")}" placeholder="e.g. +60 12-345 6789"></label>
        <h3 class="subhead" style="margin:14px 0 2px">Notifications</h3>
        <p class="muted small" style="margin:0 0 8px">Choose how you'd like to be notified.</p>
        <label class="switch"><input type="checkbox" id="psNotifyInApp" ${u.notifyInApp !== false ? "checked" : ""}><span>In-app notifications</span></label>
        <label class="switch"><input type="checkbox" id="psNotifyEmail" ${u.notifyEmail !== false ? "checked" : ""}><span>Email notifications</span></label>
        <p id="psError" class="error" role="alert" hidden></p>
        <button class="btn primary block" type="submit"><i data-lucide="save"></i><span>Save changes</span></button>
      </form>
      <hr style="border:none;border-top:1px solid var(--line,#2a2a2a);margin:18px 0">
      <form class="form" id="passwordForm">
        <h3 class="subhead" style="margin:0 0 2px">Reset password</h3>
        <p class="muted small" style="margin:0 0 8px">Other devices will be signed out after you change it.</p>
        <label class="field"><span>Current password</span><input id="pwCur" type="password" autocomplete="current-password" required></label>
        <label class="field"><span>New password</span><input id="pwNew" type="password" autocomplete="new-password" minlength="6" required></label>
        <label class="field"><span>Confirm new password</span><input id="pwConf" type="password" autocomplete="new-password" minlength="6" required></label>
        <p id="pwError" class="error" role="alert" hidden></p>
        <button class="btn block" type="submit"><i data-lucide="key-round"></i><span>Update password</span></button>
      </form>`;
    $("drawerBackdrop").hidden = false; icons();
    $("psName").focus();

    $("profileForm").onsubmit = async (e) => {
      e.preventDefault();
      const err = $("psError"); err.hidden = true;
      const fullName = $("psName").value.trim();
      if (!fullName) { err.textContent = "Name cannot be empty."; err.hidden = false; return; }
      const patch = {
        fullName,
        phone: $("psPhone").value.trim(),
        notifyInApp: $("psNotifyInApp").checked,
        notifyEmail: $("psNotifyEmail").checked
      };
      try {
        await IAM.updateProfile(patch);
        me = await IAM.me();
        $("meName").textContent = me.user.fullName;
        $("meAvatar").textContent = initials(me.user.fullName);
        toast("Profile updated.");
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    };

    $("passwordForm").onsubmit = async (e) => {
      e.preventDefault();
      const err = $("pwError"); err.hidden = true;
      const cur = $("pwCur").value, next = $("pwNew").value, conf = $("pwConf").value;
      if (next.length < 6) { err.textContent = "New password must be at least 6 characters."; err.hidden = false; return; }
      if (next !== conf) { err.textContent = "New passwords do not match."; err.hidden = false; return; }
      try {
        await IAM.changePassword(cur, next);
        $("pwCur").value = $("pwNew").value = $("pwConf").value = "";
        toast("Password updated.");
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
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
