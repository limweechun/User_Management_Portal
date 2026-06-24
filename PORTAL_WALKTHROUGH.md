# LIVE WALKTHROUGH & ACCEPTANCE CHECKLIST
## Production React Admin Portal — `https://demi.true-eco.com/portal/`

> Authoritative operator-facing acceptance run for the User Management Portal (UMP) React rebuild. Every step is grounded in the shipped code behavior and a live unauthenticated prod probe. Steps that touch real production data are flagged ⚠️; steps that require a Super Admin are flagged 🔒.

---

## 1. Pre-flight

| Item | What to do |
|------|-----------|
| **Open the portal** | Browse to `https://demi.true-eco.com/portal/` (the root `https://demi.true-eco.com/` serves the identical SPA — single-origin). You should see a brief "Loading…" pulse, then the split-screen Login (emerald hero left, "Sign in" form right). |
| **Log in as the REAL Super Admin** | Use the genuine production Super Admin credentials. Super Admin is required to exercise the 🔒 steps (global-role changes, app-admin/deletion-rights grants, maintenance toggles, app delete). A plain Portal Admin can do most non-🔒 steps. |
| **Confirm single-origin cookie** | After login, open DevTools → Application → Cookies for `demi.true-eco.com`. You must see the **`wo_id` session cookie**. The client (`iam.ts`) hard-codes `BASE='/api/v1'` with `credentials:'include'` and relies entirely on this same-origin cookie — there is **no bearer token** on the web client. If the portal were ever served cross-origin from the IAM service, every call would silently 401/403. |
| **Remember-me note** | Leave "Remember me" checked for a stable test session (persistent identity + refresh cookie surviving browser restart). Unchecked issues session cookies that die on browser close. |

### ⚠️ STRONG RECOMMENDATION — test on throwaway objects only

> **Every mutation in Section 4 alters REAL production access-control state and is server-audited.** To avoid changing a real employee's access just to test:
>
> 1. **Create a THROWAWAY TEST COMPANY** first (Tier 1 → "Add New Company", e.g. name `ZZ-ACCEPTANCE-TEST`). Do all company-scoped mutation tests against it.
> 2. **Create a THROWAWAY TEST USER** (self-register a junk email via "Create one", or use an existing disposable account). Do all Tier-3 access/role/entitlement/deletion-rights mutations against this test user **inside the test company**.
> 3. **Never** flip global-role, app-admin, deletion-rights, app Live/Maintenance, or app Delete on a real employee/app "just to see the toast."
> 4. Settings writes (branding, prefs, ID format, SMTP) are **global platform settings** — there is no throwaway sandbox for them. Treat each as a real change; record the prior value before saving so you can restore it.
> 5. "Send test email" delivers a **real email** via the live SMTP transport — send it to your own inbox.

---

## 2. Read-only smoke path (~5 min)

The fastest happy path. Touches login, launcher, all 3 tiers (view + sort only), and one of each admin screen. **Changes NO production data.**

| # | Action | Expect |
|---|--------|--------|
| 1 | Land on `…/portal/` signed out. | Brief "Loading…" pulse → split-screen Login renders (emerald hero left, Email + Password, Remember me checked, "Forgot password?", "No account? Create one"). |
| 2 | Sign in with the real Super Admin email + password (Remember me checked). | Button → "Please wait…", then the screen swaps to **Home / app launcher**. |
| 3 | Read the **"Your apps"** grid. | Responsive tile grid of entitled+active apps (alphabetical, natural-numeric sort). Avatar initials, name, email top-right. Green **"User Management"** tile (Shield) at the end. |
| 4 | Click the green **"User Management"** tile. | Switches to the admin hub (AdminLayout). Top nav: Workspace · Apps · Feedback · Audit · Settings (Apps & Settings visible because you are portal admin). Workspace tab is active by default. |
| 5 | **Tier 1:** read the **Companies** column. | Alphabetically sorted list; each row = initials avatar, name, `{companyCode || —} · {status}`; count pill matches row count. |
| 6 | **Tier 1:** click your **test company** (or any company) row. | Row highlights emerald; Tier 2 now shows that company's name + "N user(s) with access". (No network call.) |
| 7 | **Tier 2:** click the **"User"** column header once, then again, then a third time. | Sort cycles **unsorted → asc → desc → reset**; active header turns emerald with up/down chevron; third click returns to grey neutral icon. (Pure client-side.) |
| 8 | **Tier 2:** click a user row. | Row highlights; **Tier 3 drawer** slides in titled with the user's name, showing Account role + App access list (calls `GET /admin/apps`). View only — do not change anything. |
| 9 | Close the Tier 3 drawer (X / backdrop). | Drawer slides out; no write. |
| 10 | Click the **Feedback** tab. | Table loads newest-first; four stat cards (Total/New/Reviewed/Resolved) populate; App + Status filter dropdowns fill. |
| 11 | Click the **Audit** tab. | "Audit Log" header with event count; newest 100 rows; pager "1–100 of {total}"; action + app dropdowns populate. |
| 12 | Click the **Apps** tab. | "Apps Registry" with count pill; one row per app (Icon, App ID, Name, Short name, Live toggle; Maintenance column + Delete visible because Super Admin). |
| 13 | Click **Settings** → leave on **General**. | 3 sub-tabs (General · Email · ID Format); General loads branding + platform-preference cards. View only — do not Save. |
| 14 | Click **"Apps Portal"** (grid icon, top-left). | Returns to the launcher **without** signing out. |

If all 14 pass, the deploy's read path, auth, routing, and every admin screen are healthy.

---

## 3. Deep acceptance — by screen

> Operator order: **Auth → Launcher → Tier 1 → Tier 2 → Tier 3 → Apps → Feedback → Audit → Settings.**
> 🔒 = Super-Admin-only. ⚠️ in this section flags steps that write production data (full consolidated list in Section 4).

### 3.1 Auth (Login / Register / Forgot / Reset / Awaiting-approval)

> There is **no "Denied" screen**. App phase is only `booting | login | reset | awaiting | app`. "Denied" on sign-in = an inline **rose error box** on the Login form. The closest full-screen block is the **"Awaiting approval"** card (`GET /me` status `pending`).

| Action | Expect | Failure (if broken) |
|--------|--------|--------------------|
| Land signed out, no query params. | "Loading…" pulse (phase `booting`) → split-screen Login. Hero brand from `GET /branding` (default "Workplace"). | Stuck forever on "Loading…", blank white screen, or jumps to Home/Awaiting with no session. |
| ⚠️ Type valid email+password, Remember me checked, click **Sign in**. | Button "Please wait…" + disabled → `onAuthed()` calls `refresh()` → screen swaps to **Home**. Persistent identity+refresh cookie set. | Stays on form; rose error with correct creds; spinner never clears; lands on blank screen. |
| Sign in with wrong password / unknown email / deactivated / unverified account. | Inline **rose error box**: "Invalid email or password." / "This account is deactivated." / "Please verify your email before signing in." Form stays; no nav. | No error (silent), generic "Something went wrong", or it wrongly logs in. |
| ⚠️ Uncheck **Remember me**, then sign in. | Login still lands on Home, but server issues **session** cookies (die on browser close) + shorter refresh TTL. | Toggle has no effect (cookies still persist after restart), or unchecking blocks login. |
| Click the **eye** icon in the password field. | Toggles masked ↔ visible (type=password/text), Eye/EyeOff swap. Purely visual. | Icon does nothing, or field stuck masked/visible. |
| ⚠️ Click **Create one** → fill Full name + Email + Password (min 6), click **Create account**. | Flips back to "Sign in" with green notice "Account created. Verify your email, then sign in."; password cleared. Backend makes an **active** user, role NEW_USER, assigns a UserCode. | Rose "…email already exists." for a fresh email; no green notice; password not cleared; stays on Register after 200. |
| Register with short/blank fields or <6-char password. | HTML5 required/minLength blocks empty + short client-side; server zod reject surfaces as rose error. | Short/blank accepted and account created; browser submits past required attrs. |
| ⚠️ **Forgot password?** → enter email → **Send reset link**. | Switches to "Reset your password" (email-only). Green notice **always** "If that email exists, a reset link is on its way." (anti-enumeration). SMTP → emailed `/?reset=<token>` valid 1 hour. | Notice reveals whether email exists; no notice; rose error leaks existence. |
| ⚠️ Open emailed `/?reset=<token>` → app boots in **reset** mode → new password (min 6) → **Update password**. | "Set a new password" (no email field). Green toast "Password updated — please sign in."; `?reset` stripped via `replaceState`; flips to Sign in. Backend marks email verified, burns token, **revokes all sessions**. | Rose "This reset link is invalid or has expired." for a fresh link; no toast; `?reset` stays in URL; no return to Sign in. |
| Open `/?reset=` with a stale/used/malformed token → submit. | Rose "This reset link is invalid or has expired." Stays on reset form. (Absent token → client throws "Missing reset token".) | Expired/used token accepted and password changed; no error. |
| Click **← Back to sign in** from Register/Forgot/Reset. | Returns to Sign in; clears error/notice banners. No request. | Stays on prior mode; leftover banner persists. |
| Sign in/reload as a user whose `GET /me` status is `pending`. | Full-screen **"Awaiting approval"** card: "You're signed in as `<name>`, but your account is pending an administrator's approval." with a single **Sign out**. Launcher NOT shown. | Pending user reaches Home; name blank/undefined; card shows for an active user. |
| ⚠️ Click **Sign out** on Awaiting (or Home). | `POST /auth/logout` clears cookies + revokes refresh token; in-memory session cleared → Login. | Stays put; throws; or returns to Login but cookie still live (next reload re-enters). |
| ⚠️ Append `?logout=1` and load. | Boot effect best-effort `POST /auth/logout`, strips query, shows Login. (Cross-app logout target.) | `?logout=1` stays; session not cleared; lands on Home. |

**Auth gotchas:** Awaiting-approval is effectively **dead** in the normal flow — self-register lands `active` (NEW_USER, no app access), so the in-app "Create account" never produces a `pending` user. Reset token is read from the **query string** (`?reset=`), not the URL hash. There's **no in-app email-verify screen** — a self-registered user can be stuck unable to sign in until verified out-of-band. None of these auth actions are Super-Admin gated.

### 3.2 Launcher (post-login home)

| Action | Expect | Failure |
|--------|--------|---------|
| Land on launcher, read **"Your apps"**. | "WO / Workplace Operations / Choose an app" badge; responsive 2/3/4-col grid. Tiles = apps you're **entitled to AND have ≥1 company access on AND** `active !== false`; alpha + natural-numeric sort. Avatar/name/email top-right. | Grid empty for an entitled user; tiles you have no company access to; inactive app shows; wrong sort (App 10 before App 2). No apps + not portal admin → "No apps have been assigned…". |
| Click an **internal** app tile (`url === '/<id>'`). | Navigates to `/<id>` (no `#token=`). Gateway serves it same-origin under `wo_id`. | href is `#`, 404, or wrongly appends `#token=` to an internal app. |
| Click an **external** app tile (absolute `http(s)://` url). | Background-minted launch token; footer shows "Open →"; click → `a.url + '#token=<accessToken>'` handing the JWT via URL fragment. | Links to bare external URL with no `#token=` (mint failed silently) — external app bounces you to its own login. |
| Click the **psjags01** (PSM / handoff) tile. | Token minted on mount; anchor → `/psjags01/auth/callback#token=<accessToken>` (the handoff callback, NOT the app's raw url). | Link omits `#token=`, points to app root, or callback rejects expired/missing token. |
| Observe a maintenance tile (NOT Super Admin). | Non-clickable div (cursor-not-allowed, opacity-60), rose "Under maintenance" footer, hover tooltip = `maintenanceMessage`. No token minted. | Maintenance tile still works/lets you in; tooltip/message missing. |
| 🔒 Observe/click a maintenance tile **as Super Admin**. | Bypass: tile stays clickable, amber **"Maintenance — enter"** (Wrench). Token still minted for http/handoff. | Super Admin sees disabled div, or a normal user sees the amber affordance (gating inverted). |
| Click green **"User Management"** tile (Shield). | Switches to admin hub. Tile present only when `canUsePortal(me)` (admin/superadmin OR App-Admin on ≥1 app). | Missing for a portal/App-Admin, or visible to a plain user; click throws. |
| Click avatar/name (Settings2). | Opens **PersonalSettings** panel over the launcher. | Button does nothing; opens with stale/blank identity. |
| Click **Sign out** (LogOut). | `POST /api/v1/auth/logout` clears `wo_id`; returns to Login; in-memory tiles/tokens discarded. | Cookie persists / stays logged in; errors instead of Login. |

**Launcher gotchas:** Granted-tile filter requires **all three** conditions — an entitlement with **zero company access shows no tile**. Token is minted **lazily** only for `http(s)://` or HANDOFF_CALLBACK apps with a companyId; internal apps never mint. `companyId` is always `companies[0]` (first in your list — no picker). Super-Admin maintenance bypass here is **client-side only**; real enforcement is gateway/backend 503. `GET /admin/apps` is intentionally readable by any signed-in user. Branding is fetched but **discarded** in render.

### 3.3 Tier 1 — Companies (Workspace scope panel)

| Action | Expect | Failure |
|--------|--------|---------|
| Open Workspace tab (loads on mount). | "Loading…" → alpha-sorted company list (`orderBy name asc`); each row = initials avatar, name, `{companyCode || —} · {status}`; count pill = `companies.length`. | Stuck "Loading…"; "No companies." when companies exist; **403** = user lacks portal-or-app-admin; count pill 0 despite rows. |
| Type in **"Search companies…"**. | Live client-side filter on **name only** (case-insensitive `includes`). Clear restores full list; no match → "No companies." No network call. | Does nothing; filters wrong field (not companyCode/status); case-sensitive; fires a request. |
| Click a company row. | Row highlights emerald; **Tier 3 state PURGED** (`selectedUser=null` before setting company) — any open Tier-3 drawer closes. Single selection. No server call. | Row won't highlight; prior Tier-3 drawer stays open (cross-tenant contamination); selecting fires a request. |
| Click **"Add New Company"**. | `AddCompanyDrawer` slides in (slideInR over blurred scrim), "Add new company". Fields: Company name (required, autofocus), SSM reg no., Email, Phone, Address, City, State, Postcode, Website; Cancel + Create. | Button dead; no slide-in; scrim missing; name not autofocused. |
| ⚠️ Fill fields, click **Create company** (name non-empty). | `iam.createCompany`; button "Saving…"; success → green "Company created", form resets, drawer closes, list reloads, **new company auto-selected** (purges Tier 3). Backend assigns slug + companyCode + audit `create_company`. | Blank name → no-op. Dup name → red "A company with that name exists." (409 slug clash). Invalid email → red "A valid contact email is required." Generic → red toast. Regression: "created" toast but list doesn't reload / not selected; stuck "Saving…". |
| Click **Cancel** / X / scrim / **Esc** while drawer open. | Drawer closes; Cancel is `type=button` (no submit); unsaved field values persist (only a successful create resets to EMPTY). | Won't dismiss; Cancel accidentally creates a company; closing fires a request. |
| Re-mount panel / let onCreated reload. | `GET /admin/companies` re-fetches; count + rows refresh; prior selection kept only if it reappears (matched by id). Pure read. | Reload wipes selection unexpectedly; double-fetch; stale counts. |

**Tier 1 gotchas:** `selectCompany()` **always** purges `selectedUser` (even re-selecting the same company). **Read vs write gating differ:** listing = `requireCanUsePortal` (any portal/app admin reads); creating = `requirePortalAdmin` (an app-admin-only user can SEE the list but a create 403s). Search is **name-only, client-side**. The create drawer does **not** send `address2`, `logo`, or the Malaysian statutory numbers (EPF/SOCSO/EIS/income-tax) — those are edited via the company profile screen elsewhere. Slug uniqueness is the dedupe key (spacing/case collisions → 409). Per-company user counts come back on the payload but Tier 1 doesn't display them.

### 3.4 Tier 2 — Users Directory (middle column)

| Action | Expect | Failure |
|--------|--------|---------|
| Arrive on Workspace before any company selected. | Centered grey placeholder: "Select a company on the left to view its users." No table/search/header. | A table renders with no company chosen, OR placeholder persists after a Tier-1 click. |
| Pick a company in Tier 1. | Tier 2 header = company name + "N user(s) with access"; table appears filtered to that company; any open Tier-3 drawer force-closed. | List empty/wrong; count wrong; prior Tier-3 drawer stays open (cross-tenant). |
| Read the filtered rows. | Only users with a per-company access row for this company **OR** an app-wide `isAppAdmin` grant. Each row: initials, name, email, User ID (`userCode` or em-dash), Role pill (Super/Portal Admin = emerald, others grey), Status pill (active=emerald, pending=amber, inactive=grey). | Users from other companies leak in; an app-wide admin missing; a user with access absent. |
| Observe during initial load / post-edit reload. | Single centered "Loading…" row across all 4 columns; header/search stay. | Loading row never clears; stale rows during reload. |
| Company with no matching users. | One centered row "No users in this company yet."; header shows "0 users with access". | Blank table no message; "Loading…" stuck; JS error on empty list. |
| Type in **"Search users…"**. | Live client-side filter on **fullName, email, OR userCode** (case-insensitive, trimmed); count updates; clear restores; layered on top of company filter, never widening. | Does nothing; wrong fields; case-sensitive; hits network per keystroke; searches across all companies. |
| Click a column header (User / ID / Role / Status) once. | Active column turns emerald, chevron → up, rows ascending (locale+numeric; null/empty sort **last**). Role sorts by human label. | Does nothing; wrong column; case-sensitive/non-numeric; empties sort first. |
| Click same header again. | Descending; chevron → down; column stays active. | Resets instead of descending; icon doesn't update. |
| Click same header a third time. | **Reset** to unsorted; grey + neutral ChevronsUpDown; natural order returns. Cycle = unsorted→asc→desc→reset. | Third click stays descending, or jumps back to ascending. |
| Click a different header while one is active. | New column → ascending (fresh cycle); old header reverts grey. Only one active at a time. | Both active at once; new column inherits old direction. |
| Click anywhere on a user row. | User selected (row emerald-50); **Tier 3 drawer** opens titled with the name, rendering `Tier3AccessPanel`. No fetch on click (reuses loaded object). | Click dead; wrong user; drawer with no panel (no company); fetches detail on click. |

**Tier 2 gotchas:** Entirely **read-only** — the only network call is the parent's one-time `GET /admin/users?status=all` (re-fired on Tier-3 `reload()`). Status filter hard-wired to `all` (inactive + pending included; Status pill is the only signal). Search matches **userCode too** (backend `q` matches only name+email — but this box is client-side). App-Admin users appear in **every** company's directory for that app (the `isAppAdmin` OR-clause) — don't read their presence as "has access to this specific company." Sort state is **not** reset on company switch or search. Empties-last is by design.

### 3.5 Tier 3 — Access Panel (contextual IAM control)

> Mounts only when **both** a company (Tier 1) AND a user (Tier 2) are selected. **No Save button — every control writes immediately**, then reloads the directory and re-selects the fresh user.

| Action | Expect | Failure |
|--------|--------|---------|
| Open by clicking a user (company already selected). Calls `iam.listApps()`. | Drawer slides in titled with the name; avatar/name/email; **"Account role"** card shows current `globalRole`; **"App access · `<company>`"** lists every active app with a No Access / User / App Admin dropdown reflecting `accessFor(app)`. | Drawer empty/stuck; "No apps in the catalog." (listApps failed silently); App Admin option missing for non-super; dropdown shows wrong current value. |
| 🔒 ⚠️ Change **Account role** select (New User / Ordinary User / Director / Portal Admin / Super Admin). Disabled unless Super Admin. | **Super Admin:** optimistic save → reload → re-select → green "Account role updated"; select shows new role. **Non-super:** control disabled + note "Only a Super Admin can change the account role." (no request). | Non-super triggers it → red hard-stop toast; real super gets 403 "Super Admin only." (auth desync); role reverts after reload. **Guards:** can't demote yourself out of super; can't demote the last super (→ forbidden toast). |
| ⚠️ Set an app row to **User** (plain access in the active company). | Entitlement ensured → company access granted (default ORDINARY_USER); reload + re-select; green "Updated `<app>`"; row expands to reveal **Role in `<company>`** + **Deletion-approval rights**. NOT client-super-gated. | "User is not entitled to this app — a Super Admin must assign the app first." (order wrong) or "That company is not set up for this app." (appCompany link missing); dropdown reverts to No Access. |
| 🔒 ⚠️ Set an app row to **App Admin (all companies)** (option only renders for Super Admin, or if already appadmin). | Entitlement upserted `isAppAdmin:true` + company access (re)granted; green "Updated `<app>`"; stays on App Admin. Makes user app-wide admin across **all** companies. | Non-super → red hard-stop, no write; super → 403 "Only a Super Admin can set app-admin or deletion-approval rights."; grant doesn't take effect app-wide. |
| 🔒 ⚠️ On an App-Admin row, set to **No Access** (demote). | `crossesAdmin` true → super required; **full entitlement revoked** (`setEntitlement entitled:false`) — server cascades all access rows + the admin flag; green "Updated `<app>`"; collapses to No Access. | Non-super → hard-stop; super → dropdown snaps back to App Admin after reload (orphaned-entitlement bug) or 403. |
| ⚠️ On a plain **User** row, set to **No Access** (revoke this company). | Not super-gated. Removes the company-access row; if it was the **last** company on the app (`companies.length<=1`) the whole entitlement is also removed; green "Updated `<app>`"; collapses + sub-controls disappear. | Still shows "User" after reload; or access removed but a stale zero-company entitlement lingers. |
| ⚠️ On an expanded row, change **Role in `<company>`** (per-company role for this app). | No client super-gate. Save → reload → green "Role updated"; select shows new role. Persists role + derived level for the (user, app, company) tuple. | "Invalid role." / not-entitled / company-not-set-up; reverts after reload. (Server `requireAppAdmin` blocks a plain user even if UI shown.) |
| 🔒 ⚠️ Flip **Deletion-approval rights** toggle. Disabled unless Super Admin. | **Super Admin:** entitlement updated `canApproveDeletions`; reload; green "Deletion rights granted/revoked." **Non-super:** disabled, no request. | Non-super triggers → red hard-stop; super → 403; toggle reverts after reload. |
| Close the panel (X / backdrop / onClose). | `selectUser(null)`; drawer slides out. No write; already-committed edits persist (no batched Save). | Won't close; closing fires a stray request; switching users reuses stale prior state. |

**Tier 3 gotchas:** **Two distinct super-gates** — (1) Account role + Deletion-approval are **unconditionally** Super-Admin-only; (2) the access dropdown is super-gated **only when it crosses the App-Admin boundary** (`value==='appadmin' || ent.isAppAdmin`). Granting plain User / changing per-company role are NOT client-super-gated (a Portal Admin, or server-side an App Admin via `requireAppAdmin`, can do them). App Admin is **app-wide, not per-company** (a single `isAppAdmin` flag, no company rows). The whole access dropdown is **disabled** when `acc==='appadmin' && !superGate` (a Portal Admin can't touch an existing app-admin row). The server **re-enforces every elevation** independent of the client gate. Granting plain User is a **2-call sequence** (entitlement upsert THEN company access — order matters). Per-company and account-role dropdowns reuse the **same 5-role list**, but a high per-company label confers **no portal authority** (that's `globalRole`/`platformRole` only). Every mutation is **server-audited**.

### 3.6 Apps Registry

> Tab visible only to portal admins (`isPortalAdmin` = superadmin OR admin). The **Maintenance column** and per-row **Delete** render only when `canSuper` (superadmin) — a plain ADMIN sees neither.

| Action | Expect | Failure |
|--------|--------|---------|
| Land on Apps (auto-loads). | "Apps Registry" + slate count pill; one row/app (Icon, App ID, Name, Short name, Live toggle, Maintenance toggle 🔒, Edit/Delete). "Loading…" while fetching; empty → "No apps." | Stuck "Loading…"; red "Could not load apps"; blank/errors. 401/403 = same-origin cookie contract broken. |
| Click green **"Add app"** (Plus). | Drawer "New app": Full name (autofocus), read-only auto App ID, Short name, Icon (+ live IconChip), Live toggle (defaults ON), and 🔒 Maintenance toggle + message. No request yet. | Won't open; pre-filled with a prior app (state not reset); Maintenance shown to non-super. |
| Type a Full name. | App ID auto-derives (`deriveAppId`: first letter of each word up to 6 + next-free 2-digit series, e.g. `tcbpp01`); helper "opens at /\<id\>" updates live. | App ID blank/"—" for a multi-word name; collides with an existing id; doesn't match `^[a-z]{1,6}[0-9]{2}$`. |
| ⚠️ Click **Create app** (Save). | "Saving…" → drawer closes → green "App created." → list reloads with new row. `url` sent as `'/'+id`. | Inline rose: "Enter a full name…" / "An app with that ID already exists." (409) / "App name is required." (400). 403 = non-portal-admin reached it. |
| Click **Edit** (Pencil) on a row. | Drawer "Edit app — `<name>`" pre-filled; **App ID read-only** ("The App ID can't be changed."); Maintenance editable only 🔒. | Opens empty/wrong app; App ID becomes editable; maintenance fields for a non-super. |
| ⚠️ Edit Name/Short name/Icon/Live, click **Save changes**. | Drawer closes → green "App updated." → reload. Sends name, shortName, icon, active. 🔒 also issues a **second** maintenance PUT. | Rose "App name cannot be empty." / "Nothing to update." / "App not found." Maintenance silently not persisting (super) = the separate PUT errored. Non-super edit must never change maintenance. |
| ⚠️ Flip a row's **Live** toggle. | Brief disable (busyId) → green "App is now live." / "App taken offline." → reload. Offline row at opacity-60. Controls launcher visibility (`active`). | Reverts with red "Could not update app"; opacity/state mismatched after reload. |
| 🔒 ⚠️ Flip a row's **Maintenance** toggle. | Green "App put into maintenance." / "App back online." → reload; amber "Maintenance" pill by the name; `maintenanceMessage` preserved. Enforced platform-wide (gateway blocks, backends 503 non-admins). | Column absent for non-super; a non-super invocation short-circuits with red "Restricted to Super Admins"; 403; amber pill not appearing = regression. |
| 🔒 ⚠️ Click **Delete** (trash) → confirm `window.confirm`. | Confirm warns it removes the app + everyone's access, irreversible. OK → row disables → green "App deleted." → reload without the row. Server cascades to all app-company links + every user's entitlement/access (`onDelete: Cascade`). | Trash absent for non-super; cancel must fire **no** request; red "Could not delete app" / 403; **spot-check access didn't silently survive**. |
| Click **Cancel** / close in the drawer. | Closes, no network call, unsaved edits discarded; reopen starts from server state. | Stays open; stray create/update on cancel. |

**Apps gotchas:** App ID is permanent (read-only on create, immutable on edit). Apps always launch at `/<id>` (no URL field). `GET /admin/apps` is **not** admin-gated server-side. **Live = launcher visibility only**; Maintenance is a **separate, stronger** platform-wide control (a second `setAppMaintenance` call). Delete is destructive + irreversible, guarded only by a browser `confirm()` (no typed-name). All writes audited (`create_app`/`edit_app`/`delete_app`/`set_app_maintenance`). Single-flight `busyId`; the whole list reloads after each mutation (no optimistic UI).

### 3.7 Feedback Center

> Tab hardcoded `show:true` — visible to any portal **or** app admin. **Status change is the only write and is `requirePortalAdmin`** — an app-admin can open it and click the dropdown but the save 403s.

| Action | Expect | Failure |
|--------|--------|---------|
| Open Feedback (mount). | "Loading…" → rows newest-first; 4 stat cards (Total/New/Reviewed/Resolved); App-filter lists every app by name. Empty → "No feedback yet." | Stuck "Loading…"; red error ("Failed to load feedback." / 403 = neither portal nor app admin); dropdown shows raw app ids (= `/admin/apps` failed). |
| Pick an app in **"All apps"**. | Refetch filtered to that app; cards recompute over filtered rows; none → "No feedback for this filter." | Rows don't change; list errors; counts stale vs visible rows. |
| Pick a status (New/Reviewed/Resolved). | Refetch filtered; empty → "No feedback for this filter." | Ignores filter / returns all; error string in body. |
| Type in **"Search feedback…"**. | ~250ms debounce → refetch; server matches **message + name + email** (case-insensitive LIKE). Only the settled value fires. | Request per keystroke (no debounce); never refetches; wrong fields. |
| Click a row (not the Status cell). | Right-side "Feedback detail" drawer: App, From (name+email), Category, Rating (stars), Status, Page URL, Created, Updated, full Message. No network call. | Won't open / blank; clicking the **Status cell** wrongly opens the drawer (stopPropagation broken). |
| Close the detail drawer. | Closes, detail clears, table stays filtered. | Stays open / frozen overlay. |
| ⚠️ Change a row's inline **Status** dropdown (e.g. New → Reviewed). | Persists; whole list reloads; green "Status updated."; stat cards recompute. Audited `feedback_status`. Click contained to the cell (no drawer). | Red "Failed to update status." **403 is the key regression: an app-admin can see the dropdown but the backend rejects** ("Super Admin or Portal Admin only."). Or dropdown change opens drawer / no refresh. |
| Click **Export CSV** (Download). | CSV from the **currently filtered** rows (createdAt, appId, name, email, category, rating, status, pageUrl, message; RFC-4180 quoted) → `feedback-YYYY-MM-DD.csv`; green "Exported N rows." Empty table → red "No feedback to export." | No download; empty/garbled file; exports ALL ignoring filters; no toast. (Exports raw appId by design.) |

**Feedback gotchas:** Visibility (portal OR app admin) vs write-permission (portal admin only) **mismatch** is the likeliest confusing regression. Status change is the only write (audited; valid set strictly new/reviewed/resolved). Server caps the list at **500 rows**, sorts createdAt desc, **no pagination** — older items silently drop, and CSV only covers what's loaded. Stat cards + Export operate on the **current filtered set**. Search is server-side debounced. This screen is **global/cross-app** — no company-switcher influence.

### 3.8 Audit Log

> Tab `show:true` (visible to any admin-shell user incl. app-admins), but **`GET /admin/audit` is `requirePortalAdmin`** — a non-portal-admin app-admin sees the tab then a rose load error. **Entirely read-only.**

| Action | Expect | Failure |
|--------|--------|---------|
| Observe on tab open (no click). | Header "Audit Log" + "{total} event(s)"; newest 100 rows; pager "1–100 of {total}"; "All actions" dropdown from the response's distinct action list; "All apps" from `/admin/apps`. | Stuck "Loading…"; rose error ("Admin access required." / 403 for non-portal-admin); "No audit entries yet." when events exist; empty dropdowns. |
| Pick a specific action (e.g. `set_global_role`). | Offset → 0; refetch filtered; total/pager update; selection sticks; empty → "No audit entries for this filter." | Rows unchanged; total stale; pager still page 2; empty wording says "yet" instead of "for this filter." |
| Pick an app by name. | Offset → 0; refetch scoped to that appId; App column reflects it. | List unchanged; other apps' events still show; dropdown shows ids not names. |
| Type in **"Search audit…"**. | ~250ms debounce, trimmed, offset → 0; refetch. Backend matches action text + detail text + actor/target by email/full name (actor OR target). | Request per keystroke / never; known actor email returns nothing; spaces change results (should trim). |
| Click **Next**. | Offset +100; next 100 load; footer e.g. "101–200 of {total}"; Next auto-disables at total; Prev enables once offset > 0. Filters preserved. | Next stays enabled on last page (empty fetch); range off-by-one. |
| Click **Prev**. | Offset −100 (clamped 0); previous window loads; Prev disables at 0. Filters preserved. | Prev enabled at 0; offset negative; jumps >1 page. |
| Read **Actor**/**Target** columns. | Server-resolved email (fallback fullName, then id); "—" when none. Display-only. | Raw UUIDs for existing users (server lookup failed); every row "—" despite ids. |
| Click a row. | Drawer "Audit entry": When / Action (pill) / Actor / Target / App / Company + pretty-printed Detail (JSON 2-space, or raw string, or "—"). | Won't open; "[object Object]"; Company missing (only shown in drawer). |
| Close the drawer. | Selected row clears; table/filters/page unchanged. | Won't close; closing refetches / resets filters. |
| Click **Export CSV** (rows loaded). | `audit-YYYY-MM-DD.csv` with **only the current page's** rows (createdAt, action, actor, target, appId, companyId, detail; escaped, detail object stringified); toast "Exported {n} rows." Pure client blob. | No download; header-only file; toast count mismatch; commas in detail break columns. |
| Click **Export CSV** when empty. | No download; red "No audit entries to export." | Empty header-only CSV downloads; no feedback. |

**Audit gotchas:** Read-only — viewing does not itself create an audit entry. Tab-visibility vs backend-gating mismatch (app-admin sees the tab, gets 403 inline). **CSV exports the current 100-row page only** — no server-side "export all." Page size hard-coded 100. Search is debounced + trimmed, server-side across action/detail/actor/target. Action dropdown comes from the response's distinct list; app dropdown from `/admin/apps`. Empty-state wording is filter-aware. No Super-Admin-only controls here (super actions appear only as the audit **rows** they produced).

### 3.9 Settings + Personal Settings + Admin Shell

> "Apps" and "Settings" nav tabs render only for portal admins. **Nothing in Settings is Super-Admin-only** — every settings write is `requirePortalAdmin` (a plain ADMIN can change branding, prefs, ID format, SMTP).

| Action | Expect | Failure |
|--------|--------|---------|
| Click **Settings** tab. | 3 sub-tabs (General · Email · ID Format); General active; its two cards (Login branding, Platform prefs) load via GET ("Loading…"). | Tab missing for a portal admin; stuck "Loading…" / blank cards (loadSettings rejected). |
| ⚠️ Edit "Login page company name"/"Login page message" → **Save** (branding card). | "Saving…" → green "Saved"; persists to `login_branding`. | Red ("Save failed"); stuck "Saving…". |
| ⚠️ Change Timezone/Date format/Currency/Language → **Save** (Platform prefs). | "Saving…" → green "Saved"; writes `general_prefs`. | Red "Save failed"; not persisted on reload. |
| Click **Email** tab. | SMTP config + Diagnostics cards after "Loading…"; host/port/user/from prefilled; Password blank with "•••••• (leave blank to keep)" when one is stored (`hasPassword`). | Fields empty after load; placeholder shows "SMTP password" despite a stored secret. |
| ⚠️ Toggle "Enable email sending", fill host/port/user, optionally a new password (blank = keep), From name/email, toggle SSL/TLS (465) → **Save**. | "Saving…" → green "Saved"; **blank password preserves the stored secret**; password never echoed back. | Red "Save failed"; saving blank **wipes** the stored secret (server regression). |
| Diagnostics: enter a recipient → **Send test**. | "Sending…" → inline green "✓ Test email sent." + a **real email** via the saved SMTP config. Button disabled while empty. | Inline red "✗ Failed…"; no email. Invalid format / missing saved host → 400. |
| Diagnostics: **Check connection**. | "Checking…" → green "✓ Connection + login… succeeded." or red "✗ … failed: …" ("no SMTP host saved" if none). **No email sent.** | Result never appears; reports success while real reset emails still fail. |
| Click **ID Format** tab. | Loads the global User ID format: Prefix (default "UR"), Separator, Digits, Include year/month toggles, + live "Next User ID preview". | Fields don't reflect the saved `idFormats` 'user' entry; preview doesn't update. |
| ⚠️ Adjust Prefix (max 8, upper-cased)/Separator/digits/toggles → **Save**. | "Saving…" → green "Saved"; upserts the **'user'** `entityKey` entry (prefix trimmed/upper, fallback "UR"); **other entityKey entries preserved**. Affects NEW users only. | Red "Save failed"; or save **drops** non-user idFormats entries. |
| Click avatar/name pill (top-right) → **Personal settings**. | Drawer "Personal settings": Profile (Full name, Phone, In-app/Email notif toggles) prefilled from session + Change password form. | Opens empty (me not loaded) or won't open. |
| ⚠️ Edit name/phone/toggles → **Save profile**. | Button disables → green "Profile saved" → session refresh (`GET /me`) so header pill updates live. Edits **your own** account only. | Red toast; header name doesn't update (refresh didn't fire). |
| ⚠️ Current + New password (min 6) → **Change password**. | Disables → green "Password changed"; fields clear. Server verifies current, revokes your **other** sessions; **current cookie stays valid (you stay logged in here)**. | Red "Current password is incorrect" (401) / "Could not change password"; or you get unexpectedly signed out. |
| Switch nav tabs (Workspace/Apps/Feedback/Audit/Settings). | Active pill emerald; body swaps. Workspace full-height (3-tier grid); others in a padded scrollable max-w-6xl. Apps/Settings only for portal admins. | A portal-admin tab hidden, or a non-portal-admin sees Apps/Settings; switching throws/wrong screen. |
| Click **"Apps Portal"** (grid, top-left). | Returns to the Launcher (`view='launcher'`) **without** signing out. | Does nothing, or signs you out. |
| Click **Sign out** (LogOut). | Logout request fires; in-memory session nulled; returns to Login. | Stays on admin; cookie not cleared (refresh re-logs in). |

**Settings gotchas:** Tabs gated **client-side** by `isPortalAdmin`; real enforcement is server-side, but **every settings write is `requirePortalAdmin`, NOT `requireSuperadmin`** (contrast: app maintenance/delete + global-role are super-only). Email password: GET never returns it; **blank on save = keep** — don't retype it. **Save SMTP before testing** (test/verify use the saved config). "Send test" delivers a **real email** via live SMTP. ID Format affects **new** user IDs only and **re-merges** non-'user' entries. Personal settings is self-service for any active user and writes **only your own** account. Changing your own password keeps the current cookie valid. "Apps Portal" is a pure view flip (NOT logout) — easy to confuse with Sign out. Settings tabs are local state with **no URL routing** — refresh resets to Workspace/General.

---

## 4. ⚠️ Mutation steps — change REAL production data

> **Consolidated "be careful here" list.** Every row writes real production state and is server-audited. **Do all of these against a THROWAWAY TEST COMPANY + THROWAWAY TEST USER** (see Pre-flight) except where noted as global/self-only. 🔒 = Super Admin required.

| # | Area | Action | API write | Throwaway-test advice |
|---|------|--------|-----------|----------------------|
| 1 | Auth | Successful **Sign in** (sets persistent cookie/session) | `POST /auth/login` + `GET /me` | Use the test Super Admin / a disposable account. |
| 2 | Auth | Sign in with **Remember me unchecked** (session cookies) | `POST /auth/login {rememberMe:false}` | Same disposable account. |
| 3 | Auth | **Create account** (register) | `POST /auth/register` | Use a **junk email** — this is how you mint your throwaway test user. |
| 4 | Auth | **Forgot password → Send reset link** | `POST /auth/forgot-password` | Send to a disposable inbox; never trigger on a real employee. |
| 5 | Auth | **Reset password** via emailed link (revokes ALL that user's sessions) | `POST /auth/reset-password` | Throwaway user only — it logs out every device of that user. |
| 6 | Auth | **Sign out** (Awaiting/Home) | `POST /auth/logout` | Safe; only ends your own session. |
| 7 | Auth | Load **`?logout=1`** | `POST /auth/logout` | Safe; ends your own session. |
| 8 | Tier 1 | **Create company** | `POST /admin/companies` | This step **creates** the throwaway test company (e.g. `ZZ-ACCEPTANCE-TEST`). |
| 9 | Tier 3 | 🔒 Change **Account role** (global-role) | `PUT /admin/users/:id/global-role` | **Throwaway user only.** Guards block self-demote / last-super-demote. |
| 10 | Tier 3 | Set app access to **User** (entitlement + company access) | `PUT …/entitlements/:app` → `PUT …/apps/:app/companies/:companyId` | Throwaway user **inside the test company**. |
| 11 | Tier 3 | 🔒 Set app access to **App Admin (all companies)** | `PUT …/entitlements/:app {isAppAdmin:true}` → company access | Throwaway user only — this is **app-wide**, not just the test company. |
| 12 | Tier 3 | 🔒 Demote **App Admin → No Access** (full entitlement revoke) | `PUT …/entitlements/:app {entitled:false}` | Throwaway user only. |
| 13 | Tier 3 | Revoke plain **User → No Access** (+ entitlement cleanup if last company) | `DELETE …/apps/:app/companies/:companyId` (+ conditional entitlement off) | Throwaway user only. |
| 14 | Tier 3 | Change **Role in `<company>`** (per-company role) | `PUT …/apps/:app/companies/:companyId {role}` | Throwaway user/company. |
| 15 | Tier 3 | 🔒 Flip **Deletion-approval rights** | `PUT …/entitlements/:app {canApproveDeletions}` | Throwaway user only. |
| 16 | Apps | **Create app** | `POST /admin/apps` | Create a junk app (e.g. name → id `zz…`); delete it after (#20). Affects the real catalog/launcher. |
| 17 | Apps | **Edit app** (name/shortName/icon/Live) | `PATCH /admin/apps/:id` (+ 🔒 maintenance PUT) | Edit your junk test app only — editing a real app changes its launcher tile. |
| 18 | Apps | Flip **Live** toggle | `PATCH /admin/apps/:id {active}` | **Never on a real app** — taking a real app offline hides it from every user's launcher. Test on the junk app. |
| 19 | Apps | 🔒 Flip **Maintenance** toggle | `PUT /admin/apps/:id/maintenance` | **Never on a real app** — it 503s real users platform-wide. Test on the junk app. |
| 20 | Apps | 🔒 **Delete app** (cascades all entitlements/access) | `DELETE /admin/apps/:id` | **Only the junk test app.** Irreversible; wipes everyone's access for that app. |
| 21 | Feedback | Change **Status** (New/Reviewed/Resolved) | `PATCH /admin/feedback/:id {status}` | If you must test, change a real row and **set it back**; or note it as a one-way state nudge. Audited. |
| 22 | Settings | Save **Login branding** | `PUT /admin/settings/login_branding` | **Global.** Record the old value first, restore after. |
| 23 | Settings | Save **Platform prefs** | `PUT /admin/settings/general_prefs` | **Global.** Record + restore. |
| 24 | Settings | Save **Email/SMTP config** | `PUT /admin/email-config` | **Global.** Leave password blank to keep the live secret; record other fields first. |
| 25 | Settings | Save **ID Format** | `PUT /admin/settings/idFormats` | **Global**, affects new user IDs only. Record + restore the 'user' entry. |
| 26 | Settings | Save **Profile** | `PATCH /me/profile` + `GET /me` | Self-only — edits **your own** account. Restore your real name/phone after. |
| 27 | Settings | **Change password** | `POST /me/change-password` | Self-only; revokes your other sessions (current stays valid). Use the test Super Admin if you don't want to rotate the real one. |

> **Note:** "Send test email" and "Check connection" (Settings → Email) are marked `mutatesProd=false` (no portal data row changes) **but "Send test" delivers a real email** via live SMTP — send it to your own inbox, treat with care in prod.

---

## 5. Live-deploy proof (already verified)

Compact result of the unauthenticated prod probe — the plumbing is confirmed **before** you start.

| Check | Target | Expected | Observed | Pass |
|-------|--------|----------|----------|:----:|
| Portal index serves React SPA | `GET /portal/` | 200 HTML, title "User Management", refs `/portal/assets/*.js` | 200, text/html, 463 B; `<title>User Management</title>`; refs `index-e8y1VbI3.js` + `index-CHdVv6M8.css` | ✅ |
| Linked JS + CSS resolve | `GET /portal/assets/index-e8y1VbI3.js` + `…css` | 200, correct content-types | JS 200 `application/javascript`; CSS 200 `text/css` (hashed Vite assets) | ✅ |
| Root serves same SPA (single-origin) | `GET /` | Same SPA index as `/portal/` | 200, 463 B, identical title + identical asset refs | ✅ |
| API health is up | `GET /api/v1/health` | 200 | 200 `{"ok":true,"service":"iam","env":"production"}` | ✅ |
| `/me` is auth-gated | `GET /api/v1/me` (no cookie) | 401 | 401 `{"error":"Not signed in."}` | ✅ |
| Admin companies auth-gated | `GET /api/v1/admin/companies` (no cookie) | 401/403 | 401 `{"error":"Not signed in."}` | ✅ |
| Admin users auth-gated | `GET /api/v1/admin/users` (no cookie) | 401/403 | 401 `{"error":"Not signed in."}` | ✅ |
| Apps endpoint behavior | `GET /api/v1/apps` (no cookie) | note what it returns | 404 Express "Cannot GET /api/v1/apps" — route not at this path (catalog is `/api/v1/admin/apps`). **Benign, no data leak.** | ✅ |
| SPA fallback for unknown path | `GET /portal/zzz-nonexistent` | note SPA fallback vs 404 | 200, identical SPA index — history fallback active | ✅ |

**Summary:** Single-origin SPA (title "User Management", hashed Vite assets) served at both `/` and `/portal/` with SPA history fallback; `/api/v1/health` 200; all sensitive endpoints correctly 401 with no cookie. The only deviation is `/api/v1/apps` returning a plain Express 404 — that route simply doesn't exist there (the catalog lives at `/api/v1/admin/apps`); it is **not** an auth failure or data leak.

---

## 6. If something fails

### Failure-signatures table

| Symptom | Likely cause | First check |
|---------|-------------|-------------|
| Stuck forever on "Loading…" at boot | `GET /me` hangs/never resolves | Network tab: is `/api/v1/me` pending/erroring? Is `wo_id` cookie present? |
| Login form rejects **correct** creds with a rose error | Same-origin cookie/CORS broken, or IAM auth desync | Confirm portal is served **same-origin** with IAM; `iam.ts` BASE must be relative `/api/v1`. |
| Launcher shows **no tiles** for an entitled user | `/me` or `/admin/apps` failed (both catch to empty), OR entitlement has zero company access | Network tab for both calls; verify the user has ≥1 company access AND app `active`. |
| External/handoff app bounces to its own login | Launch token mint failed silently (`#token=` missing) | Inspect the tile's href for `#token=`; check `POST /api/v1/app-token`. |
| Tier-3 drawer stays open / shows prior user after switching company | Cross-tenant purge regression (`selectCompany` not nulling `selectedUser`) | Switch companies in Tier 1 — drawer must slam shut. |
| Tier-3 access dropdown reverts after save | 2-call order wrong, appCompany link missing, or orphaned entitlement | Watch the two sequential PUTs; confirm the company is set up for the app. |
| App-admin row snaps back to "App Admin" after "No Access" | Entitlement not fully revoked (orphan) | Confirm `PUT …/entitlements/:app {entitled:false}` fired, not just a company-row delete. |
| Feedback **Status** save 403s | App-admin (not portal admin) — `requirePortalAdmin` on the write | Verify operator is Portal/Super Admin, not merely app-admin. |
| Audit tab loads then shows rose error | Non-portal-admin app-admin (tab `show:true`, endpoint `requirePortalAdmin`) | Operator must be a portal admin. |
| Apps Maintenance/Delete column missing | Operator is a plain ADMIN, not Super Admin (`canSuper` gate) | Expected — these are 🔒 super-only. |
| SMTP "Saved" but reset emails still fail | Verify reported false, or saved-config mismatch | Settings → Email → **Check connection**; ensure host saved + password not wiped. |
| `?reset=` token always "invalid or has expired" | Token single-use / 1-hour, or read from hash not query | Use a **fresh** link; token is in the **query** (`?reset=`), not the hash. |
| Any admin call returns 401/403 unexpectedly | `wo_id` cookie missing / cross-origin | DevTools cookies; confirm single-origin serving. |

### One-commit rollback (legacy portal returns in one build, no data loss)

> The React rebuild lives in `UserManagementPortal/web/` and is shipped to production as the committed built `web/dist` served by **iam-service** (the legacy portal was left untouched). If the React portal is broken, restore the previous portal with a single revert + redeploy:

1. **Identify** the commit on the portal `main` branch that introduced/updated the React `web/dist` build (the cutover commit `fb8a6aa`, merged to main as `36698c9..fb8a6aa`).
2. **Revert that one commit** (`git revert <commit>`) — this restores the previously committed `web/dist` (the legacy portal bundle). No migrations, no schema changes, no data are touched — **the rollback is purely the static front-end bundle**.
3. **Redeploy iam-service.** On Render's next build the reverted `dist` is served and the **legacy portal returns in one build**.
4. **Data is safe:** all companies, users, entitlements, access rows, feedback, audit, and settings live in the shared Supabase DB behind the same `/api/v1` API — the rollback changes only which front-end bundle iam-service serves, not any data. Once a fix is ready, revert the revert (or land the fix) and redeploy to bring the React portal back.

> Because auth, the API, and all data are unchanged by a front-end rollback, you can roll back at any point during this acceptance run without losing in-flight test objects — though you should still clean up any throwaway test company/user/app you created (Section 4).
