// Typed IAM API client for the User Management Portal (React rewrite).
// Ported 1:1 from the legacy iam-api.js: same endpoints, same cookie auth (credentials:include),
// same /api/v1 base served SAME-ORIGIN by the IAM service. Never point this at another host or
// the wo_id session cookie / CORS will break.

const BASE = '/api/v1'

async function req<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  let data: any = null
  try { data = await res.json() } catch { /* no JSON body */ }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`)
  return data as T
}

// ---- Types ----
export type GlobalRole = 'SUPERADMIN' | 'ADMIN' | 'DIRECTOR' | 'ORDINARY_USER' | 'NEW_USER'
export type PlatformRole = 'superadmin' | 'admin' | 'user'
export type UserStatus = 'pending' | 'active' | 'inactive'

export interface RoleCatalogEntry {
  name: string
  label: string
  rank: number
  tier?: number | null
  appId?: string | null
  functionTag?: string | null
  description?: string | null
}

export interface CompanyAccess {
  companyId: string
  name: string
  role?: string | null
  level: string
  rank?: number
  tier?: number | null
}

export interface MeUser {
  id: string
  email: string
  userCode?: string | null
  fullName: string
  phone?: string | null
  status: UserStatus
  emailVerified: boolean
  globalRole: GlobalRole | string
  platformRole: PlatformRole
  notifyInApp?: boolean
  notifyEmail?: boolean
}

export interface Me {
  user: MeUser
  platformRole: PlatformRole
  globalRole: GlobalRole | string
  roles: RoleCatalogEntry[]
  status: UserStatus
  apps: Record<string, { isAppAdmin: boolean; canApproveDeletions: boolean; companies: CompanyAccess[] }>
}

export interface AdminUserEntitlement {
  appId: string
  appName?: string
  isAppAdmin: boolean
  canApproveDeletions: boolean
  companies: CompanyAccess[]
}

export interface AdminUser {
  id: string
  email: string
  userCode?: string | null
  fullName: string
  phone?: string | null
  status: UserStatus
  emailVerified: boolean
  createdAt?: string
  deactivatedAt?: string | null
  globalRole: GlobalRole | string
  platformRole: PlatformRole
  entitlements: AdminUserEntitlement[]
}

export interface Company {
  id: string
  name: string
  slug?: string
  companyCode?: string | null
  status: 'active' | 'inactive'
  regNo?: string | null
  address?: string | null
  address2?: string | null
  postcode?: string | null
  city?: string | null
  state?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  logo?: string | null
  epfNo?: string | null
  socsoNo?: string | null
  eisNo?: string | null
  incomeTaxNo?: string | null
  activeUsers?: number
  inactiveUsers?: number
}

export interface App {
  id: string
  name: string
  shortName?: string | null
  icon: string
  url?: string
  active: boolean
  maintenanceMode?: boolean
  maintenanceMessage?: string | null
}

export interface AuditRow {
  id?: string
  createdAt: string
  action: string
  actor?: string // resolved actor name/email (server-side)
  target?: string // resolved target name/email (server-side)
  appId?: string | null
  companyId?: string | null
  detail?: any
}
export interface AuditPage { items: AuditRow[]; total: number; actions: string[] }

export interface Feedback {
  id: string
  appId: string
  userId?: string | null
  email?: string | null
  name?: string | null
  category: string
  rating?: number | null
  message: string
  pageUrl?: string | null
  status: 'new' | 'reviewed' | 'resolved'
  createdAt: string
  updatedAt: string
}

export interface Branding {
  companyName?: string
  message?: string
  logoDataUrl?: string
  photoDataUrls?: string[]
  photoDataUrl?: string
}

// ---- API surface ----
export const iam = {
  // Auth
  register: (b: { email: string; fullName: string; password: string }) => req('POST', '/auth/register', b),
  verifyEmail: (token: string) => req('POST', '/auth/verify-email', { token }),
  login: (email: string, password: string, rememberMe?: boolean) =>
    req('POST', '/auth/login', { email, password, rememberMe: !!rememberMe }),
  forgotPassword: (email: string) => req('POST', '/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) => req('POST', '/auth/reset-password', { token, password }),
  logout: () => req('POST', '/auth/logout').catch(() => {}),
  me: () => req<Me>('GET', '/me'),
  getBranding: () => req<Branding>('GET', '/branding'),
  updateProfile: (patch: Partial<MeUser>) => req('PATCH', '/me/profile', patch),
  changePassword: (currentPassword: string, newPassword: string) =>
    req('POST', '/me/change-password', { currentPassword, newPassword }),

  // Role catalog
  globalRoles: () => req<RoleCatalogEntry[]>('GET', '/roles'),
  rolesForApp: (appId: string) => req<RoleCatalogEntry[]>('GET', '/roles?app=' + encodeURIComponent(appId)),

  // App launch token (for opening apps from the launcher)
  appAccessToken: (app: string, companyId: string) =>
    req<{ accessToken: string; claims: any }>('POST', '/app-token', { app, companyId }),

  // Admin — users
  listUsers: (filter?: { status?: string; q?: string }) => {
    const status = filter?.status || 'all'
    const q = filter?.q || ''
    return req<AdminUser[]>('GET', '/admin/users?status=' + encodeURIComponent(status) + (q ? '&q=' + encodeURIComponent(q) : ''))
  },
  createUser: (b: { email: string; fullName: string; password: string; phone?: string; globalRole?: GlobalRole }) =>
    req('POST', '/admin/users', b),
  updateUser: (id: string, patch: { fullName?: string; email?: string; emailVerified?: boolean }) =>
    req('PATCH', '/admin/users/' + id, patch),
  resetUserPassword: (id: string, password: string) => req('POST', '/admin/users/' + id + '/reset-password', { password }),
  approveAccount: (id: string) => req('POST', '/admin/users/' + id + '/approve'),
  setUserStatus: (id: string, status: 'active' | 'inactive') =>
    req('POST', '/admin/users/' + id + '/' + (status === 'active' ? 'activate' : 'deactivate')),
  setGlobalRole: (id: string, globalRole: GlobalRole) => req('PUT', '/admin/users/' + id + '/global-role', { globalRole }),

  // Admin — entitlements (which apps) + per-company role
  setEntitlement: (
    userId: string,
    appId: string,
    patch: { entitled?: boolean; isAppAdmin?: boolean; canApproveDeletions?: boolean },
  ) => req('PUT', '/admin/users/' + userId + '/entitlements/' + appId, patch),
  setCompanyAccess: (userId: string, appId: string, companyId: string, role: string) =>
    req('PUT', '/admin/users/' + userId + '/apps/' + appId + '/companies/' + companyId, { role }),
  removeCompanyAccess: (userId: string, appId: string, companyId: string) =>
    req('DELETE', '/admin/users/' + userId + '/apps/' + appId + '/companies/' + companyId),

  // Admin — companies
  listCompanies: () => req<Company[]>('GET', '/admin/companies'),
  createCompany: (data: Partial<Company>) => req<Company>('POST', '/admin/companies', data),
  updateCompany: (id: string, patch: Partial<Company>) => req('PATCH', '/admin/companies/' + id, patch),

  // Admin — apps registry
  listApps: () => req<App[]>('GET', '/admin/apps'),
  createApp: (b: { id: string; name: string; shortName?: string; icon?: string; url?: string; active?: boolean }) =>
    req('POST', '/admin/apps', b),
  updateApp: (id: string, patch: Partial<App>) => req('PATCH', '/admin/apps/' + encodeURIComponent(id), patch),
  deleteApp: (id: string) => req('DELETE', '/admin/apps/' + encodeURIComponent(id)),
  setAppMaintenance: (id: string, maintenanceMode: boolean, maintenanceMessage?: string) =>
    req('PUT', '/admin/apps/' + encodeURIComponent(id) + '/maintenance', {
      maintenanceMode,
      maintenanceMessage: maintenanceMessage || '',
    }),
  appCompanyLinks: () => req<{ appId: string; companyId: string }[]>('GET', '/admin/app-companies'),
  setAppCompany: (appId: string, companyId: string, enabled: boolean) =>
    req('PUT', '/admin/apps/' + appId + '/companies/' + companyId, { enabled }),

  // Admin — audit / feedback / settings
  listAudit: (p?: { limit?: number; offset?: number; action?: string; appId?: string; q?: string }) => {
    const qs = new URLSearchParams()
    qs.set('limit', String(p?.limit ?? 100))
    if (p?.offset) qs.set('offset', String(p.offset))
    if (p?.action && p.action !== 'all') qs.set('action', p.action)
    if (p?.appId && p.appId !== 'all') qs.set('appId', p.appId)
    if (p?.q) qs.set('q', p.q)
    return req<AuditPage>('GET', '/admin/audit?' + qs.toString())
  },
  listFeedback: (f?: { app?: string; status?: string; q?: string }) =>
    req<Feedback[]>(
      'GET',
      '/admin/feedback?app=' + encodeURIComponent(f?.app || 'all') +
        '&status=' + encodeURIComponent(f?.status || 'all') +
        (f?.q ? '&q=' + encodeURIComponent(f.q) : ''),
    ),
  setFeedbackStatus: (id: string, status: string) => req('PATCH', '/admin/feedback/' + id, { status }),
  submitFeedback: (b: { app: string; category: string; rating?: number | null; message: string }) =>
    req('POST', '/feedback', b),
  loadSettings: () => req<Record<string, any>>('GET', '/admin/settings'),
  saveSetting: (key: string, value: any) => req('PUT', '/admin/settings/' + encodeURIComponent(key), { value }),
  getEmailConfig: () => req<any>('GET', '/admin/email-config'),
  saveEmailConfig: (cfg: any) => req('PUT', '/admin/email-config', cfg),
  testEmail: (to: string, config?: any) => req('POST', '/admin/email-config/test', config ? { to, config } : { to }),
  verifyEmailConfig: () => req('POST', '/admin/email-config/verify'),
}

// ---- Helpers over Me ----
export const isSuperAdmin = (me: Me | null) => !!me && me.platformRole === 'superadmin'
export const isPortalAdmin = (me: Me | null) =>
  !!me && (me.platformRole === 'superadmin' || me.platformRole === 'admin')
export const canUsePortal = (me: Me | null) => {
  if (isPortalAdmin(me)) return true
  const a = me?.apps || {}
  return Object.keys(a).some((id) => a[id].isAppAdmin)
}
export const appsIAdminister = (me: Me | null): string[] => {
  const a = me?.apps || {}
  if (isSuperAdmin(me)) return Object.keys(a)
  return Object.keys(a).filter((id) => a[id].isAppAdmin)
}
