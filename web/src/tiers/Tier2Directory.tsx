import { useEffect, useMemo, useState } from 'react'
import { Search, Users } from 'lucide-react'
import { iam, isPortalAdmin, isSuperAdmin, type AdminUser, type GlobalRole } from '../lib/iam'
import { useSession } from '../context/SessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useToast } from '../components/Toast'
import { useSortable } from '../hooks/useSortable'
import { SortableHeader } from '../components/SortableHeader'
import { StyledSelect } from '../components/StyledSelect'
import { TierCard } from '../components/TierCard'
import { fmtDate, roleLabel, GLOBAL_ROLE_OPTIONS } from '../lib/util'

// Stable accessor map for the universal sort hook (key → value extractor).
const ACCESSORS: Record<string, (u: AdminUser) => unknown> = {
  user: (u) => u.fullName,
  id: (u) => u.userCode || '',
  role: (u) => roleLabel(u.globalRole),
  status: (u) => u.status,
  created: (u) => u.createdAt || '', // ISO strings sort chronologically as text
}

// Tier 1 — User Directory: EVERY login on the platform (user-first flow — no company
// filter; scope comes later in Tier 2). Selecting a row drives Tiers 2-3. The Global
// Role is set inline here, so onboarding a fresh signup is:
// pick the user → set their role → pick a company → grant per-app access.
// Global-role authority is graduated (mirrors the server): a Super Admin has the full
// ladder; a Portal Admin may only set New User ↔ Ordinary User and can never assign
// portal authority (Portal Admin / Super Admin) nor change a target who already holds it.
export function Tier2Directory({
  users,
  loading,
  reload,
}: {
  users: AdminUser[]
  loading: boolean
  reload: () => Promise<AdminUser[]>
}) {
  const { me } = useSession()
  const { toast } = useToast()
  const { selectedUser, selectUser } = useWorkspace()
  const superGate = isSuperAdmin(me)
  // A Portal Admin (platformRole 'admin', not 'superadmin'): may set the global role but
  // only within the New User ↔ Ordinary User band, and never on a portal-authority target.
  const portalAdminOnly = isPortalAdmin(me) && !superGate
  const [q, setQ] = useState('')
  // Focus the directory on active users by default; switchable to inactive / all.
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active')
  const [savingRole, setSavingRole] = useState<string | null>(null)
  const [statusBusy, setStatusBusy] = useState(false)
  const [verifyBusy, setVerifyBusy] = useState(false)

  // Verify a user's email ON THEIR BEHALF — for people stuck at the sign-in gate who never
  // clicked the emailed verification link (typo, spam folder, SMTP down). Portal-admin action.
  const verifyEmail = async (u: AdminUser) => {
    setVerifyBusy(true)
    try {
      await iam.verifyUserEmail(u.id)
      const list = await reload()
      const fresh = list.find((x) => x.id === u.id)
      if (fresh) selectUser(fresh)
      toast('Email marked verified — they can sign in now', 'ok')
    } catch (e: any) {
      toast(e?.message || 'Could not verify email', 'bad')
    } finally {
      setVerifyBusy(false)
    }
  }

  // Account status lives HERE in Tier 1 (it's a global, per-login property — not
  // scoped to a company or app). Portal-admin-gated, never on your own account,
  // and only a Super Admin may touch a portal-authority account (mirrors the server).
  const toggleStatus = async (u: AdminUser) => {
    const next = u.status === 'active' ? 'inactive' : 'active'
    if (
      next === 'inactive' &&
      !window.confirm(`Deactivate ${u.fullName}?\n\nThey will be blocked from signing in to every app until reactivated.`)
    )
      return
    setStatusBusy(true)
    try {
      await iam.setUserStatus(u.id, next)
      const list = await reload()
      const fresh = list.find((x) => x.id === u.id)
      if (fresh) selectUser(fresh)
      toast(next === 'inactive' ? 'User deactivated' : 'User reactivated', 'ok')
    } catch (e: any) {
      toast(e?.message || 'Action failed', 'bad')
    } finally {
      setStatusBusy(false)
    }
  }

  // A login with no app/company access at all (e.g. freshly self-registered) — tagged
  // so admins can spot pending onboarding work at a glance.
  const isUnassigned = (u: AdminUser) => !u.entitlements.some((e) => e.isAppAdmin || e.companies.length > 0)

  const visible = useMemo(() => {
    const byStatus = statusFilter === 'all' ? users : users.filter((u) => u.status === statusFilter)
    const s = q.trim().toLowerCase()
    if (!s) return byStatus
    return byStatus.filter(
      (u) =>
        u.fullName.toLowerCase().includes(s) ||
        u.email.toLowerCase().includes(s) ||
        (u.userCode || '').toLowerCase().includes(s),
    )
  }, [users, q, statusFilter])

  const { sorted, sortState, toggle } = useSortable(visible, ACCESSORS)

  // If the selected user becomes inactive (e.g. just deactivated) while we're focused on active
  // users, widen to "all" so they stay visible and selectable for reactivation.
  useEffect(() => {
    if (selectedUser && statusFilter === 'active' && selectedUser.status !== 'active') setStatusFilter('all')
  }, [selectedUser, statusFilter])

  const setRole = async (u: AdminUser, role: string) => {
    // Client-side mirror of the server rule (re-enforced there regardless). A Super Admin
    // has the full ladder. A Portal Admin may only set New User / Ordinary User, and only
    // on a target who is not already an Admin or Super Admin.
    if (!superGate) {
      const targetHasAuthority = u.platformRole === 'admin' || u.platformRole === 'superadmin'
      const inBand = role === 'NEW_USER' || role === 'ORDINARY_USER'
      if (!portalAdminOnly || targetHasAuthority || !inBand) {
        toast('Only a Super Admin can assign portal authority or change an Admin / Super Admin.', 'bad')
        return
      }
    }
    setSavingRole(u.id)
    try {
      await iam.setGlobalRole(u.id, role as GlobalRole)
      toast('Global role updated', 'ok')
      const list = await reload()
      const fresh = list.find((x) => x.id === u.id)
      if (fresh && selectedUser?.id === u.id) selectUser(fresh)
    } catch (e: any) {
      toast(e?.message || 'Failed to update role', 'bad')
    } finally {
      setSavingRole(null)
    }
  }

  return (
    <TierCard icon={<Users className="h-3.5 w-3.5" />} label="Tier 1: User Directory" className="min-w-0 flex-1">
      <div className="shrink-0 px-4 pt-3">
        <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-2 transition-all duration-200 focus-within:border-emerald-500">
          <Search className="h-3.5 w-3.5 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search user name, email or IDs…"
            className="w-full bg-transparent text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
          />
        </div>
        <div className="mt-2 inline-flex items-center gap-0.5 rounded-lg border border-slate-800 bg-slate-900/60 p-0.5">
          {(['active', 'inactive', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={
                'rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition-all duration-200 ' +
                (statusFilter === s ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:text-slate-200')
              }
            >
              {s}
            </button>
          ))}
        </div>
        {/* Account status of the selected user — lifecycle dates + activate/deactivate. */}
        {selectedUser ? (() => {
          const su = selectedUser
          const isSelf = !!me && me.user.id === su.id
          const targetHasAuthority = su.platformRole === 'admin' || su.platformRole === 'superadmin'
          const canManageStatus = isPortalAdmin(me) && !isSelf && (!targetHasAuthority || isSuperAdmin(me))
          return (
            <div className="mt-2 rounded-xl border border-slate-800 bg-slate-800/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Account Status · {su.fullName}</div>
                  <StatusBadge status={su.status} />
                </div>
                {canManageStatus ? (
                  <button
                    onClick={() => toggleStatus(su)}
                    disabled={statusBusy}
                    className={
                      'rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-200 disabled:opacity-50 ' +
                      (su.status === 'active'
                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20')
                    }
                  >
                    {su.status === 'active' ? 'Deactivate' : 'Reactivate'}
                  </button>
                ) : null}
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-slate-700/60 pt-2.5">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Created</div>
                  <div className="text-[11px] text-slate-300">{fmtDate(su.createdAt)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Deactivated</div>
                  <div className="text-[11px] text-slate-300">{su.status === 'inactive' ? fmtDate(su.deactivatedAt) : '—'}</div>
                </div>
              </div>
              {/* Email verification — sign-in is blocked until it's done. When a user is stuck
                  (never clicked the emailed link), a portal admin can clear it for them here. */}
              {su.emailVerified === false ? (
                <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-700/60 pt-2.5">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Email verification</div>
                    <div className="text-[11px] font-medium text-amber-400">Not verified — can't sign in yet</div>
                  </div>
                  {isPortalAdmin(me) ? (
                    <button
                      onClick={() => verifyEmail(su)}
                      disabled={verifyBusy}
                      title="Mark this email verified on their behalf so they can sign in"
                      className="shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-all duration-200 hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                      Verify email
                    </button>
                  ) : null}
                </div>
              ) : null}
              {isSelf ? <div className="mt-2 text-[10px] text-slate-500">You can't change your own account status here.</div> : null}
            </div>
          )
        })() : null}
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-auto px-2">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <SortableHeader label="User ID" sortKey="id" sortState={sortState} onSort={toggle} />
              <SortableHeader label="Name" sortKey="user" sortState={sortState} onSort={toggle} />
              <SortableHeader label="Global Role" sortKey="role" sortState={sortState} onSort={toggle} />
              <SortableHeader label="Status" sortKey="status" sortState={sortState} onSort={toggle} />
              <SortableHeader label="Created" sortKey="created" sortState={sortState} onSort={toggle} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-xs text-slate-500">Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-xs text-slate-500">No users match.</td></tr>
            ) : (
              sorted.map((u) => {
                const sel = selectedUser?.id === u.id
                const legacyRole = !GLOBAL_ROLE_OPTIONS.some((o) => o.value === u.globalRole)
                // Per-row global-role authority for the SIGNED-IN actor (mirrors the server):
                // a Super Admin gets the whole ladder; a Portal Admin only the New User ↔
                // Ordinary User band, and never a target who already holds portal authority.
                const targetHasAuthority = u.platformRole === 'admin' || u.platformRole === 'superadmin'
                const roleOptions = superGate
                  ? GLOBAL_ROLE_OPTIONS
                  : GLOBAL_ROLE_OPTIONS.filter((o) => o.value === 'NEW_USER' || o.value === 'ORDINARY_USER')
                const canEditRole = superGate || (portalAdminOnly && !targetHasAuthority)
                const lockedByAuthority = portalAdminOnly && targetHasAuthority
                // Keep the dropdown showing the user's real current role even when it falls
                // outside the actor's offered options (a retired role, or an Admin / Super
                // Admin seen by a Portal Admin) instead of snapping to the first option.
                const showCurrentOutOfBand = !roleOptions.some((o) => o.value === u.globalRole)
                return (
                  <tr
                    key={u.id}
                    onClick={() => selectUser(u)}
                    className={'cursor-pointer transition-colors duration-150 ' + (sel ? 'bg-emerald-500/10' : 'hover:bg-slate-800/50')}
                  >
                    <td className="border-b border-slate-800 px-3 py-2.5 font-mono text-[11px] text-slate-400">{u.userCode || '—'}</td>
                    <td className="border-b border-slate-800 px-3 py-2.5">
                      <div className={'text-xs font-medium ' + (sel ? 'text-emerald-200' : 'text-slate-200')}>
                        {u.fullName}
                        {isUnassigned(u) && <span className="ml-1.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-400 ring-1 ring-amber-500/30" title="No app or company access granted yet — select the user, then a company, to grant access">no access yet</span>}
                      </div>
                      <div className="truncate text-[10px] text-slate-500">{u.email}</div>
                    </td>
                    {/* Inline role selector — options + edit rights depend on the actor's own
                        authority (see per-row derivation above). stopPropagation so opening the
                        dropdown doesn't also fire the row's select-user click. */}
                    <td className="border-b border-slate-800 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div title={lockedByAuthority ? 'Only a Super Admin can change this' : undefined}>
                        <StyledSelect
                          tone="dark"
                          value={String(u.globalRole)}
                          onChange={(v) => setRole(u, v)}
                          disabled={!canEditRole || savingRole === u.id}
                          className="w-36"
                        >
                          {roleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          {/* Current role shown as a disabled option when it's outside the actor's
                              offered range — a retired role (e.g. Director), or an Admin / Super
                              Admin viewed by a Portal Admin — so the dropdown still reads true. */}
                          {showCurrentOutOfBand ? <option value={String(u.globalRole)} disabled>{roleLabel(u.globalRole)}{legacyRole ? ' (retired)' : ''}</option> : null}
                        </StyledSelect>
                        {lockedByAuthority ? <div className="mt-1 text-[9px] leading-tight text-slate-500">Only a Super Admin can change this</div> : null}
                      </div>
                    </td>
                    <td className="border-b border-slate-800 px-3 py-2.5"><StatusText status={u.status} emailVerified={u.emailVerified} /></td>
                    <td className="border-b border-slate-800 px-3 py-2.5 text-[11px] text-slate-400">{fmtDate(u.createdAt)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-slate-800 px-4 py-2.5 text-[10px]">
        <span className="text-slate-500">Showing {sorted.length} {sorted.length === 1 ? 'user' : 'users'}</span>
        {sortState ? <span className="font-medium text-emerald-400">Global Sort Active</span> : <span className="text-slate-500">Sort idle</span>}
      </div>
    </TierCard>
  )
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'active'
      ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
      : status === 'pending'
        ? 'bg-amber-500/15 text-amber-300 ring-amber-500/30'
        : 'bg-slate-600/20 text-slate-400 ring-slate-500/30'
  return <span className={'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ' + tone}>{status}</span>
}

function StatusText({ status, emailVerified }: { status: string; emailVerified?: boolean }) {
  // An unverified email blocks sign-in even on an active account — surface it.
  if (status === 'active' && emailVerified === false) {
    return <span className="text-xs font-medium text-amber-400" title="This login cannot sign in until they click the verification link emailed to them">Not verified by email</span>
  }
  const cls = status === 'active' ? 'text-emerald-400' : status === 'pending' ? 'text-amber-400' : 'text-slate-500'
  return <span className={'text-xs font-medium capitalize ' + cls}>{status}</span>
}
