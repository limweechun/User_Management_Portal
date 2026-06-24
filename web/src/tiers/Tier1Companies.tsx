import { useCallback, useEffect, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { iam, type Company } from '../lib/iam'
import { useWorkspace } from '../context/WorkspaceContext'
import { AddCompanyDrawer } from '../components/AddCompanyDrawer'
import { initials } from '../lib/util'

// Tier 1 — Workspace Scope Panel (~20%): the master list of companies. Selecting one filters
// Tiers 2-3 (and purges any open Tier-3 state via the workspace context).
export function Tier1Companies() {
  const { selectedCompany, selectCompany } = useWorkspace()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setCompanies(await iam.listCompanies()) } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const filtered = companies.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="flex h-full w-1/5 min-w-[230px] flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium text-slate-800">Companies</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{companies.length}</span>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-all duration-200 hover:bg-emerald-700"
        >
          <Plus className="h-3.5 w-3.5" /> Add New Company
        </button>
        <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 transition-all duration-200 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search companies…"
            className="w-full bg-transparent text-xs placeholder:text-slate-400 focus:outline-none"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-xs text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-xs text-slate-400">No companies.</div>
        ) : (
          filtered.map((c) => {
            const sel = selectedCompany?.id === c.id
            return (
              <button
                key={c.id}
                onClick={() => selectCompany(c)}
                className={
                  'flex w-full items-center gap-2.5 border-b border-slate-50 px-4 py-2.5 text-left transition-all duration-200 ' +
                  (sel ? 'bg-emerald-50' : 'hover:bg-slate-50')
                }
              >
                <div
                  className={
                    'grid h-7 w-7 shrink-0 place-items-center rounded-md text-[10px] font-medium ' +
                    (sel ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500')
                  }
                >
                  {initials(c.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={'truncate text-xs font-medium ' + (sel ? 'text-emerald-800' : 'text-slate-700')}>{c.name}</div>
                  <div className="truncate text-[10px] text-slate-400">{c.companyCode || '—'} · {c.status}</div>
                </div>
              </button>
            )
          })
        )}
      </div>
      <AddCompanyDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(c) => { setAddOpen(false); void load().then(() => selectCompany(c)) }}
      />
    </div>
  )
}
