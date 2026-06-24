import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { AdminUser } from '../lib/iam'
import { useWorkspace } from '../context/WorkspaceContext'
import { useSortable } from '../hooks/useSortable'
import { SortableHeader } from '../components/SortableHeader'
import { initials, roleLabel } from '../lib/util'

// Stable accessor map for the universal sort hook (key → value extractor).
const ACCESSORS: Record<string, (u: AdminUser) => unknown> = {
  user: (u) => u.fullName,
  id: (u) => u.userCode || '',
  role: (u) => roleLabel(u.globalRole),
  status: (u) => u.status,
}

// Tier 2 — Directory & Operational Grid (~45%): users mapped to the active company, sortable.
export function Tier2Directory({ users, loading }: { users: AdminUser[]; loading: boolean }) {
  const { selectedCompany, selectedUser, selectUser } = useWorkspace()
  const [q, setQ] = useState('')

  const inCompany = useMemo(() => {
    if (!selectedCompany) return [] as AdminUser[]
    // App-wide admins (isAppAdmin) have access without a per-company row — include them too, or an
    // app admin with no company grant is invisible and unmanageable from the grid.
    return users.filter((u) =>
      u.entitlements.some((e) => e.isAppAdmin || e.companies.some((c) => c.companyId === selectedCompany.id)),
    )
  }, [users, selectedCompany])

  const searched = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return inCompany
    return inCompany.filter(
      (u) =>
        u.fullName.toLowerCase().includes(s) ||
        u.email.toLowerCase().includes(s) ||
        (u.userCode || '').toLowerCase().includes(s),
    )
  }, [inCompany, q])

  const { sorted, sortState, toggle } = useSortable(searched, ACCESSORS)

  if (!selectedCompany) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-slate-400">
        Select a company on the left to view its users.
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <h2 className="text-xs font-medium text-slate-800">{selectedCompany.name}</h2>
          <p className="text-[10px] text-slate-400">{sorted.length} user{sorted.length === 1 ? '' : 's'} with access</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 transition-all duration-200 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search users…"
            className="w-44 bg-transparent text-xs placeholder:text-slate-400 focus:outline-none"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto px-5 py-3">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <SortableHeader label="User" sortKey="user" sortState={sortState} onSort={toggle} />
              <SortableHeader label="ID" sortKey="id" sortState={sortState} onSort={toggle} />
              <SortableHeader label="Role" sortKey="role" sortState={sortState} onSort={toggle} />
              <SortableHeader label="Status" sortKey="status" sortState={sortState} onSort={toggle} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-xs text-slate-400">Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-xs text-slate-400">No users in this company yet.</td></tr>
            ) : (
              sorted.map((u) => {
                const sel = selectedUser?.id === u.id
                return (
                  <tr
                    key={u.id}
                    onClick={() => selectUser(u)}
                    className={'cursor-pointer transition-all duration-200 ' + (sel ? 'bg-emerald-50' : 'bg-white hover:bg-slate-50')}
                  >
                    <td className="border-b border-slate-100 px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-medium text-slate-500">{initials(u.fullName)}</div>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-slate-700">{u.fullName}</div>
                          <div className="truncate text-[10px] text-slate-400">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">{u.userCode || '—'}</td>
                    <td className="border-b border-slate-100 px-3 py-2"><RolePill role={String(u.globalRole)} /></td>
                    <td className="border-b border-slate-100 px-3 py-2"><StatusPill status={u.status} /></td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RolePill({ role }: { role: string }) {
  const admin = role === 'SUPERADMIN' || role === 'ADMIN'
  return (
    <span className={'rounded-full px-2 py-0.5 text-[10px] font-medium ' + (admin ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>
      {roleLabel(role)}
    </span>
  )
}
function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'active' ? 'bg-emerald-50 text-emerald-700' : status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
  return <span className={'rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ' + cls}>{status}</span>
}
