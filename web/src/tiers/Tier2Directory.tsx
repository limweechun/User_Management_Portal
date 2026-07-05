import { useEffect, useMemo, useState } from 'react'
import { Search, Users } from 'lucide-react'
import { iam, type AdminUser } from '../lib/iam'
import { useWorkspace } from '../context/WorkspaceContext'
import { useSortable } from '../hooks/useSortable'
import { SortableHeader } from '../components/SortableHeader'
import { TierCard } from '../components/TierCard'
import { fmtDate, roleLabel } from '../lib/util'

// Stable accessor map for the universal sort hook (key → value extractor).
const ACCESSORS: Record<string, (u: AdminUser) => unknown> = {
  user: (u) => u.fullName,
  id: (u) => u.userCode || '',
  role: (u) => roleLabel(u.globalRole),
  status: (u) => u.status,
  created: (u) => u.createdAt || '', // ISO strings sort chronologically as text
}

// Tier 2 — Compact Directory Grid: users mapped to the active company, sortable.
export function Tier2Directory({ users, loading }: { users: AdminUser[]; loading: boolean }) {
  const { selectedCompany, selectedUser, selectUser } = useWorkspace()
  const [q, setQ] = useState('')
  // Focus the directory on active users by default; switchable to inactive / all.
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active')

  // A login with no app/company access at all (e.g. freshly created and not yet
  // granted anything) belongs to no tenant. Per the onboarding policy it lists in
  // the "New Company" holding tenant — and only there — with a "no access yet" tag
  // until an admin grants access. If no tenant matches that name, unassigned
  // logins fall back to listing in every tenant, so they can never go invisible.
  const isUnassigned = (u: AdminUser) => !u.entitlements.some((e) => e.isAppAdmin || e.companies.length > 0)
  const isHoldingName = (name: string) => /^new\s*company$/i.test(name.trim())
  const isHoldingTenant = !!selectedCompany && isHoldingName(selectedCompany.name)
  // null = still loading (assume it exists to avoid a flash of unassigned users everywhere).
  const [holdingExists, setHoldingExists] = useState<boolean | null>(null)
  useEffect(() => {
    let on = true
    iam.listCompanies()
      .then((cs) => { if (on) setHoldingExists(cs.some((c) => isHoldingName(c.name))) })
      .catch(() => { if (on) setHoldingExists(true) })
    return () => { on = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const showUnassignedHere = isHoldingTenant || holdingExists === false

  const inCompany = useMemo(() => {
    if (!selectedCompany) return [] as AdminUser[]
    // App-wide admins (isAppAdmin) have access without a per-company row — include them too, or an
    // app admin with no company grant is invisible and unmanageable from the grid.
    return users.filter((u) =>
      (isUnassigned(u) && showUnassignedHere) ||
      u.entitlements.some((e) => e.isAppAdmin || e.companies.some((c) => c.companyId === selectedCompany.id)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, selectedCompany, showUnassignedHere])

  const visible = useMemo(() => {
    const byStatus = statusFilter === 'all' ? inCompany : inCompany.filter((u) => u.status === statusFilter)
    const s = q.trim().toLowerCase()
    if (!s) return byStatus
    return byStatus.filter(
      (u) =>
        u.fullName.toLowerCase().includes(s) ||
        u.email.toLowerCase().includes(s) ||
        (u.userCode || '').toLowerCase().includes(s),
    )
  }, [inCompany, q, statusFilter])

  const { sorted, sortState, toggle } = useSortable(visible, ACCESSORS)

  // If the selected user becomes inactive (e.g. just deactivated) while we're focused on active
  // users, widen to "all" so they stay visible and selectable for reactivation.
  useEffect(() => {
    if (selectedUser && statusFilter === 'active' && selectedUser.status !== 'active') setStatusFilter('all')
  }, [selectedUser, statusFilter])

  return (
    <TierCard icon={<Users className="h-3.5 w-3.5" />} label="Tier 2: Compact Directory Grid" className="min-w-0 flex-1">
      {!selectedCompany ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-slate-500">
          Select a tenant on the left to view its directory.
        </div>
      ) : (
        <>
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
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-xs text-slate-500">No users in this tenant yet.</td></tr>
                ) : (
                  sorted.map((u) => {
                    const sel = selectedUser?.id === u.id
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
                            {isUnassigned(u) && <span className="ml-1.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-400 ring-1 ring-amber-500/30" title="No app or company access granted yet — select the user to grant access">no access yet</span>}
                          </div>
                          <div className="truncate text-[10px] text-slate-500">{u.email}</div>
                        </td>
                        <td className="border-b border-slate-800 px-3 py-2.5 text-xs text-slate-300">{roleLabel(u.globalRole)}</td>
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
            <span className="text-slate-500">Showing {sorted.length} contextual {sorted.length === 1 ? 'entry' : 'entries'}</span>
            {sortState ? <span className="font-medium text-emerald-400">Global Sort Active</span> : <span className="text-slate-500">Sort idle</span>}
          </div>
        </>
      )}
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
