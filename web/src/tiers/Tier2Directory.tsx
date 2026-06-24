import { useMemo, useState } from 'react'
import { Search, Users } from 'lucide-react'
import type { AdminUser } from '../lib/iam'
import { useWorkspace } from '../context/WorkspaceContext'
import { useSortable } from '../hooks/useSortable'
import { SortableHeader } from '../components/SortableHeader'
import { TierCard } from '../components/TierCard'
import { roleLabel } from '../lib/util'

// Stable accessor map for the universal sort hook (key → value extractor).
const ACCESSORS: Record<string, (u: AdminUser) => unknown> = {
  user: (u) => u.fullName,
  id: (u) => u.userCode || '',
  role: (u) => roleLabel(u.globalRole),
  status: (u) => u.status,
}

// Tier 2 — Compact Directory Grid: users mapped to the active company, sortable.
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
          </div>
          <div className="mt-2 min-h-0 flex-1 overflow-auto px-2">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <SortableHeader label="User ID" sortKey="id" sortState={sortState} onSort={toggle} />
                  <SortableHeader label="Name" sortKey="user" sortState={sortState} onSort={toggle} />
                  <SortableHeader label="Global Role" sortKey="role" sortState={sortState} onSort={toggle} />
                  <SortableHeader label="Status" sortKey="status" sortState={sortState} onSort={toggle} />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-xs text-slate-500">Loading…</td></tr>
                ) : sorted.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-xs text-slate-500">No users in this tenant yet.</td></tr>
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
                          <div className={'text-xs font-medium ' + (sel ? 'text-emerald-200' : 'text-slate-200')}>{u.fullName}</div>
                          <div className="truncate text-[10px] text-slate-500">{u.email}</div>
                        </td>
                        <td className="border-b border-slate-800 px-3 py-2.5 text-xs text-slate-300">{roleLabel(u.globalRole)}</td>
                        <td className="border-b border-slate-800 px-3 py-2.5"><StatusText status={u.status} /></td>
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

function StatusText({ status }: { status: string }) {
  const cls = status === 'active' ? 'text-emerald-400' : status === 'pending' ? 'text-amber-400' : 'text-slate-500'
  return <span className={'text-xs font-medium capitalize ' + cls}>{status}</span>
}
