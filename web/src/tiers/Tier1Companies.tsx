import { useCallback, useEffect, useState } from 'react'
import { Plus, Search, Building2 } from 'lucide-react'
import { iam, type Company } from '../lib/iam'
import { useSession } from '../context/SessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { AddCompanyDrawer } from '../components/AddCompanyDrawer'
import { TierCard } from '../components/TierCard'

// Tier 1 — Workspace Scope: the master list of tenants. Selecting one filters Tiers 2-3 (and
// purges any open Tier-3 state via the workspace context).
export function Tier1Companies() {
  const { me } = useSession()
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
  const domain = me?.user.email?.split('@')[1]

  return (
    <TierCard
      icon={<Building2 className="h-3.5 w-3.5" />}
      label="Tier 1: Workspace Scope"
      trailing={<span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">{companies.length}</span>}
      className="w-[244px] shrink-0"
    >
      <div className="shrink-0 space-y-2.5 px-3 pt-3">
        <button
          onClick={() => setAddOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 transition-all duration-200 hover:bg-emerald-400"
        >
          <Plus className="h-3.5 w-3.5" /> Register New Company
        </button>
        <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1.5 transition-all duration-200 focus-within:border-emerald-500">
          <Search className="h-3.5 w-3.5 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tenants…"
            className="w-full bg-transparent text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
          />
        </div>
        <div className="px-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Active Tenant Register</div>
      </div>
      <div className="mt-1.5 min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        {loading ? (
          <div className="px-1 py-3 text-xs text-slate-500">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-1 py-3 text-xs text-slate-500">No companies.</div>
        ) : (
          <div className="space-y-1">
            {filtered.map((c) => {
              const sel = selectedCompany?.id === c.id
              const active = (c.status || '').toLowerCase() === 'active'
              return (
                <button
                  key={c.id}
                  onClick={() => selectCompany(c)}
                  className={
                    'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all duration-200 ' +
                    (sel ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-transparent hover:bg-slate-800/60')
                  }
                >
                  <span className={'h-2 w-2 shrink-0 rounded-full ' + (active ? 'bg-emerald-400' : 'bg-slate-600')} />
                  <div className="min-w-0 flex-1">
                    <div className={'truncate text-xs font-medium ' + (sel ? 'text-emerald-200' : 'text-slate-200')}>{c.name}</div>
                    {c.companyCode ? <div className="truncate text-[10px] text-slate-500">{c.companyCode}</div> : null}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
      {domain ? (
        <div className="shrink-0 border-t border-slate-800 px-4 py-2.5 text-[10px] text-slate-500">
          Domain: <span className="text-slate-400">{domain}</span>
        </div>
      ) : null}
      <AddCompanyDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(c) => { setAddOpen(false); void load().then(() => selectCompany(c)) }}
      />
    </TierCard>
  )
}
