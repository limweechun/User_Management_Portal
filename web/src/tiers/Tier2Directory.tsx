import { useEffect, useMemo, useState } from 'react'
import { Search, Users } from 'lucide-react'
import { iam, isSuperAdmin, type AdminUser, type GlobalRole } from '../lib/iam'
import { useSession } from '../context/SessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useToast } from '../components/Toast'
import { useSortable } from '../hooks/useSortable'
import { SortableHeader } from '../components/SortableHeader'
import { StyledSelect } from '../components/StyledSelect'
import { TierCard } from '../components/TierCard'
import { requireSuperAdmin } from '../lib/securityGate'
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
// Role is set inline here (Super-Admin-only), so onboarding a fresh signup is:
// pick the user → set their role → pick a company → grant per-app access.
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
  const [q, setQ] = useState('')
  // Focus the directory on active users by default; switchable to inactive / all.
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active')
  const [savingRole, setSavingRole] = useState<string | null>(null)

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
    if (!requireSuperAdmin(me, toast)) return
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
                    {/* Inline role selector — Super-Admin-only; stopPropagation so opening the
                        dropdown doesn't also fire the row's select-user click. */}
                    <td className="border-b border-slate-800 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <StyledSelect
                        tone="dark"
                        value={String(u.globalRole)}
                        onChange={(v) => setRole(u, v)}
                        disabled={!superGate || savingRole === u.id}
                        className="w-36"
                      >
                        {GLOBAL_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        {/* Retired roles (e.g. Director) still display for existing holders,
                            but can only be changed AWAY from — never re-assigned. */}
                        {legacyRole ? <option value={String(u.globalRole)} disabled>{roleLabel(u.globalRole)} (retired)</option> : null}
                      </StyledSelect>
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

function StatusText({ status, emailVerified }: { status: string; emailVerified?: boolean }) {
  // An unverified email blocks sign-in even on an active account — surface it.
  if (status === 'active' && emailVerified === false) {
    return <span className="text-xs font-medium text-amber-400" title="This login cannot sign in until they click the verification link emailed to them">Not verified by email</span>
  }
  const cls = status === 'active' ? 'text-emerald-400' : status === 'pending' ? 'text-amber-400' : 'text-slate-500'
  return <span className={'text-xs font-medium capitalize ' + cls}>{status}</span>
}
