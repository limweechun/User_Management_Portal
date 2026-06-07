# IAM Contract — Identity & Access Management

The single source of truth for **identity, account approval, and access grants**
across HR & Admin, Procurement, PSM, Liziz Biogas, this Admin Portal, and a
future CRM. (Approved architecture — see `please-study-and-discuss-lazy-petal.md`.)

- **Model:** full multi-company. A grant is split into **entitlement** (which apps
  a user may use — set by superadmin) and **access** (which companies + level
  within an app — set by that app's admin).
- **Auth:** true SSO. One httpOnly **identity** cookie proves who you are; each app
  mints its **own company-scoped access token** via `/app-token`, so apps switch
  company independently. Access tokens stay PSM-compatible (`userId`,
  `selectedCompanyId`, `userRole`).
- **Deployment:** one domain, sub-paths (`/login`, `/admin`, `/hr`, `/procurement`,
  `/psm`, `/biogas`, `/crm`).

---

## 1. Roles & authority

| Plane | Field | Set by | Authority |
|-------|-------|--------|-----------|
| **Platform** | `users.platform_role` = `superadmin` \| `admin` \| `user` | superadmin | `superadmin` = system authority: assigns apps, designates app admins, grants delete-approval rights, **approves all deletions globally**. `admin` = **portal admin**: approve accounts + manage companies. `user` = everyone else. |
| **App entitlement** | `app_entitlements(user, app, is_app_admin, can_approve_deletions)` | **superadmin / portal admin** (which apps); **superadmin** (the `is_app_admin` & `can_approve_deletions` flags) | which apps a user may use; who is an **app admin** for an app; who may **approve deletions** within an app. |
| **App access** | `app_access(user, app, company, level)` | **app admin** | which **companies** an entitled user can use within an app, and at what `level` (`view`/`edit`/`admin`). |

**Coarse levels** (`app_access.level`): `view` (read-only) · `edit` (read + create/update) · `admin` (full in-app powers for that company). No grant ⇒ no access.

**Companies are central, enabled per app.** The master company list is managed centrally; each app is "set up" for a subset of companies via `app_companies(app, company)` (managed by super admin / portal admin). An app admin may only grant `app_access` for companies **enabled for that app**. Each app's company switcher shows only the companies the **signed-in user has been granted** there (a subset of the app's enabled companies).

**Deletions:** a `superadmin` approves deletions everywhere. Additionally, an app admin granted `can_approve_deletions` for an app may approve deletions **within that app** (for the companies they manage). It is a discrete capability — it does NOT grant other permissions.

---

## 2. Onboarding — self-register → three-stage approval

1. **Sign-up (public):** anyone registers → `users.status = pending`, `email_verified = false`. Requires **email verification** + sign-up **rate-limiting**. A pending user can authenticate but has **zero access** ("awaiting approval").
2. **Stage 1 — account approval:** a `superadmin` or portal `admin` sets `status = active`. Working SSO login, still no app access.
3. **Stage 2 — assign apps (superadmin or portal admin):** create/remove `app_entitlements` rows (which apps a user may use). Setting `is_app_admin` and/or `can_approve_deletions` is **superadmin only**.
4. **Stage 3 — assign companies (app admin):** for an entitled app, the app's admin creates `app_access` rows (company + level) for the user.

---

## 3. Data model (Postgres / Prisma — mirrors PSM's stack)

```
users(id uuid pk, email citext unique, password_hash, full_name,
      status enum(pending,active,inactive), email_verified bool,
      platform_role enum(superadmin,admin,user), created_at, updated_at)

companies(id uuid pk, name, slug unique, status enum(active,inactive))

apps(id text pk, name, icon)                 -- 'hr'|'procurement'|'psm'|'biogas'|'crm'|'admin'

app_companies(app_id fk, company_id fk, unique(app_id, company_id))
      -- which companies each app is set up for; super/portal admin managed.
      -- app_access(user,app,company) is only allowed when (app,company) is enabled here.

app_entitlements(id uuid pk, user_id fk, app_id fk,
      is_app_admin bool default false,
      can_approve_deletions bool default false,
      granted_by, created_at, unique(user_id, app_id))     -- SUPERADMIN-controlled

app_access(id uuid pk, user_id fk, app_id fk, company_id fk,
      level enum(view,edit,admin), granted_by, created_at,
      unique(user_id, app_id, company_id))                 -- APP-ADMIN-controlled

app_catalog(app_id fk, permission_key, label, "group",
      unique(app_id, permission_key))         -- each app registers its fine perms (optional advanced drawer)

external_identities(user_id fk, provider enum(supabase,…), external_id,
      unique(provider, external_id))          -- maps IAM users ↔ Supabase (Biogas bridge)

refresh_tokens(id, user_id, token_hash, expires_at, revoked_at, created_at)
audit_log(id, actor_user_id, action, target_user_id, company_id, app_id, detail jsonb, created_at)
```

Companies a user can access in app X = `app_access(user, X, *)` — no separate membership table. PSM's own tables stay as-is; one-time seed of IAM `users` from PSM `users` by email; derive `app_entitlements`/`app_access` from PSM `UserCompanyRole`.

---

## 4. Tokens & claims

### Identity token (SSO) — httpOnly cookie `wo_id`
Set at login; proves identity to every app. Lean:
```jsonc
{ "sub":"<userId>", "userId":"<userId>", "email":"x@co.com", "name":"Jane Doe",
  "platformRole":"superadmin|admin|user", "status":"active",
  "tokenType":"identity", "iat":0, "exp":0, "jti":"<uuid>" }
```

### App access token — minted per app+company via `/app-token`
Short-lived (15 min). What each app uses for its own API calls:
```jsonc
{ "sub":"<userId>", "userId":"<userId>", "email":"x@co.com", "name":"Jane Doe",
  "app":"psm", "companyId":"<cid>", "selectedCompanyId":"<cid>",
  "platformRole":"superadmin|admin|user",
  "level":"view|edit|admin",
  "isAppAdmin": false,
  "canApproveDeletions": true,
  "userRole":"SUPERADMIN|ADMIN|MEMBER",   // PSM/Procurement-compatible alias
  "tokenType":"access", "iat":0, "exp":0, "jti":"<uuid>" }
```

**`userRole` mapping (compatibility-critical):**
- `SUPERADMIN` only when `platformRole === 'superadmin'`.
- else `ADMIN` when `level === 'admin'`.
- else `MEMBER`.

`canApproveDeletions = (platformRole === 'superadmin') || entitlement.can_approve_deletions`. Delete-approval is carried by this **separate** claim so granting it does NOT inflate a user to full permissions. Each app's delete gate checks `canApproveDeletions`. (PSM: change delete routes from `requireSuperadmin()` to `requireDeleteApproval()` reading this claim; all other gates unchanged.)

Refresh: opaque, sha-256 hashed in `refresh_tokens`, rotated on use, revoked on logout/deactivate.

---

## 5. REST API (base `/api/v1`)

### Auth & session
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/register` | `{email, fullName, password}` | creates `pending` user, sends verification email |
| POST | `/auth/verify-email` | `{token}` | marks `email_verified` |
| POST | `/auth/login` | `{email, password}` | sets identity cookie; `{user, status}` (status may be `pending`) |
| POST | `/auth/logout` | — | revoke refresh, clear cookies |
| GET | `/me` | — (identity cookie) | `{user, platformRole, apps:{ <appId>:{ isAppAdmin, canApproveDeletions, companies:[{companyId,name,level}] } }}` |
| POST | `/app-token` | `{app, companyId}` (identity cookie) | mints the app access token above (checks entitlement + access) |

### Admin — accounts & apps (portal). Scope: superadmin = all; portal `admin` = account approval + companies.
| Method | Path | Notes |
|---|---|---|
| GET | `/admin/users?status=pending` | list users (pending queue / all) |
| POST | `/admin/users/:id/approve` / `/deactivate` | Stage 1 — set status (superadmin or portal admin) |
| PUT | `/admin/users/:id/platform-role` | superadmin only |
| GET / POST | `/admin/companies` | list / create (create = superadmin or portal admin) |
| GET | `/admin/app-companies` | the app↔company availability matrix |
| PUT | `/admin/apps/:app/companies/:companyId` | `{enabled}` — set up / remove a company for an app (super or portal admin); removing also drops orphan `app_access` |
| GET | `/admin/apps` + `/admin/apps/:id/catalog` | app + fine-permission catalog |

### Admin — entitlements (Stage 2)
| Method | Path | Notes |
|---|---|---|
| GET | `/admin/users/:id/entitlements` | a user's app entitlements |
| PUT | `/admin/users/:id/entitlements/:app` | `{entitled}` → **superadmin or portal admin**. `{isAppAdmin, canApproveDeletions}` → **superadmin only**. |

### Admin — company access (Stage 3, **app admin** of that app, or superadmin)
| Method | Path | Notes |
|---|---|---|
| GET | `/admin/apps/:app/users` | users entitled to this app + their company access |
| PUT | `/admin/users/:id/apps/:app/companies/:companyId` | `{level}` (must be entitled; company must be enabled for the app; app-admin-scoped) |
| DELETE | `/admin/users/:id/apps/:app/companies/:companyId` | revoke company access |

### Authorization rules (server-enforced)
- `platform-role`, the `is_app_admin`/`can_approve_deletions` flags, delete-approval everywhere → **superadmin**.
- App entitlement (which apps a user may use), account approval, company creation, **per-app company setup** (`app_companies`) → **superadmin or portal admin**.
- Company access (`app_access`) → **app admin of that app** (or superadmin), and only for users **already entitled** to the app AND companies **enabled for that app**.
- Every mutation writes `audit_log`.

---

## 6. Security (hosted)
- bcrypt cost 12; never return `password_hash`.
- Identity cookie + access tokens: `HttpOnly; Secure; SameSite=Lax`, path `/`. Access 15 min; refresh 7 days w/ rotation + revocation.
- Rate-limit `/auth/register` and `/auth/login`; email verification before approval is meaningful; lockout after N failures; audit all auth events.
- One shared `IAM_JWT_SECRET` (distinct refresh secret) distributed to all apps.

## 7. Per-app integration checklist
1. Read the identity cookie; if absent/expired → redirect to `/login?return=<thisApp>`.
2. On entry / company switch → `POST /app-token {app, companyId}`; hold the returned access token for this app's API calls.
3. Gate UI on `level` (`view` vs `edit` vs `admin`); gate delete-approval on `canApproveDeletions`.
4. Build the company switcher from `/me` → `apps[thisApp].companies`.
5. **PSM/Procurement:** set `JWT_SECRET = IAM_JWT_SECRET`; they already validate the access token; switch delete gate to `requireDeleteApproval`.
6. **Biogas:** backend bridge accepts the identity cookie, mints a Supabase session, upserts `profiles.role`/`company_id`; rewrite RLS to enforce role + company; deletes require `canApproveDeletions`.
