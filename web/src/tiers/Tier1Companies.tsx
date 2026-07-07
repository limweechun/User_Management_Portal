import { useCallback, useEffect, useState } from 'react'
import { Plus, Search, Building2, Pencil } from 'lucide-react'
import { iam, type AdminUser, type Company } from '../lib/iam'
import { useSession } from '../context/SessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useToast } from '../components/Toast'
import { CompanyDrawer } from '../components/CompanyDrawer'
import { TierCard } from '../components/TierCard'

// Tier 2 — Company Scope: the master list of tenants. Selecting one sets which company
// the Tier-3 app grants apply to (the selected user carries over from Tier 1). Each row
// has a MEMBERSHIP TICK BOX for the selected user: ticked = the user holds per-company
// grants there, so the company appears in their in-app company switcher; unticking
// removes every grant they hold in that company (it vanishes from their switchers).
// The "+ Register" button and the row pencil open the SAME CompanyDrawer (create when
// company=null, edit otherwise).
export function Tier1Companies({ reload }: { reload: () => Promise<AdminUser[]> }) {
  const { me } = useSession()
  const { toast } = useToast()
  const { selectedCompany, selectCompany, selectedUser, selectUser } = useWorkspace()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerCompany, setDrawerCompany] = useState<Company | null>(null) // null = register new
  const [q, setQ] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await iam.listCompanies()
      setCompanies(list)
      return list
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const filtered = companies.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
  const domain = me?.user.email?.split('@')[1]

  const openAdd = () => { setDrawerCompany(null); setDrawerOpen(true) }
  const openEdit = (c: Company) => { setDrawerCompany(c); setDrawerOpen(true) }

  const afterSave = (saved: Company, isNew: boolean) => {
    setDrawerOpen(false)
    void load().then((list) => {
      if (isNew) { selectCompany(saved); return }
      if (selectedCompany?.id === saved.id) {
        const fresh = list.find((c) => c.id === saved.id)
        if (fresh) selectCompany(fresh)
      }
    })
  }

  // Membership tick box: put the company in / take it out of the selected user's
  // in-app company switcher. Apps list companies from the user's per-company grants,
  // so tick = replicate the user's app set into this company (keeping each app's
  // existing role title, else Ordinary User) and untick = remove every grant they
  // hold here (dropping an app's entitlement when this was its last company, unless
  // they're an app-wide admin) — exactly the Tier-3 "No Access" semantics.
  const toggleMembership = async (c: Company, next: boolean) => {
    if (!selectedUser || busyId) return
    const ents = selectedUser.entitlements
    if (next && ents.length === 0) {
      // A brand-new user has no apps to replicate — take the admin straight to the
      // right place: focus this company so Tier 3 is ready for the first grant.
      selectCompany(c)
      toast(`${selectedUser.fullName} has no app access yet — company selected, now grant their app access in Tier 3 →`, 'ok')
      return
    }
    if (!next) {
      const inHere = ents.filter((e) => e.companies.some((cc) => cc.companyId === c.id))
      if (inHere.length === 0) return
      if (!window.confirm(`Remove ${selectedUser.fullName} from ${c.name}?\n\nAll their app access in this company will be revoked and it will disappear from their company switcher.`)) return
    }
    setBusyId(c.id)
    // One app failing must not abort the rest or hide what did land — collect
    // per-app failures, finish the loop, and ALWAYS reload so the checkbox
    // reflects the true server state (partial grants included).
    const failures: string[] = []
    try {
      if (next) {
        for (const e of ents) {
          if (e.companies.some((cc) => cc.companyId === c.id)) continue
          try {
            const role = e.companies[0]?.role || 'ORDINARY_USER'
            await iam.setCompanyAccess(selectedUser.id, e.appId, c.id, role)
          } catch (err: any) {
            failures.push(`${e.appId}: ${err?.message || 'failed'}`)
          }
        }
      } else {
        for (const e of ents) {
          if (!e.companies.some((cc) => cc.companyId === c.id)) continue
          try {
            await iam.removeCompanyAccess(selectedUser.id, e.appId, c.id)
            if (e.companies.length <= 1 && !e.isAppAdmin) await iam.setEntitlement(selectedUser.id, e.appId, { entitled: false })
          } catch (err: any) {
            failures.push(`${e.appId}: ${err?.message || 'failed'}`)
          }
        }
      }
      if (failures.length > 0) {
        toast(`Some apps failed — ${failures.join(' · ')}`, 'bad')
      } else {
        toast(
          next
            ? `${c.name} added to ${selectedUser.fullName}'s company switcher`
            : `${selectedUser.fullName} removed from ${c.name}`,
          'ok',
        )
      }
    } finally {
      try {
        const list = await reload()
        const fresh = list.find((u) => u.id === selectedUser.id)
        if (fresh) selectUser(fresh)
      } catch { /* reload failure just leaves stale UI; next action re-syncs */ }
      setBusyId(null)
    }
  }

  return (
    <TierCard
      icon={<Building2 className="h-3.5 w-3.5" />}
      label="Tier 2: Company Scope"
      trailing={<span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">{companies.length}</span>}
      className="w-[244px] shrink-0"
    >
      <div className="shrink-0 space-y-2.5 px-3 pt-3">
        <button
          onClick={openAdd}
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
        {selectedUser ? (
          <div className="px-0.5 text-[10px] leading-snug text-slate-500">
            Tick = <span className="text-slate-400">{selectedUser.fullName}</span> can pick that company in the app company switcher.
          </div>
        ) : null}
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
              // The selected user's footprint: explicit per-company grants only (app-wide
              // admins have no company rows — their access shows in Tier 3 regardless).
              const userHasAccess = !!selectedUser?.entitlements.some((e) => e.companies.some((cc) => cc.companyId === c.id))
              return (
                <div
                  key={c.id}
                  className={
                    'group flex items-center gap-1 rounded-lg border transition-all duration-200 ' +
                    (sel ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-transparent hover:bg-slate-800/60')
                  }
                >
                  {selectedUser ? (
                    <input
                      type="checkbox"
                      checked={userHasAccess}
                      disabled={busyId != null}
                      onChange={(e) => void toggleMembership(c, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      title={
                        userHasAccess
                          ? c.name + ' is in ' + selectedUser.fullName + "'s company switcher — untick to remove their access here"
                          : 'Tick to let ' + selectedUser.fullName + ' select ' + c.name + ' in the app company switcher'
                      }
                      className="ml-2.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-emerald-500 disabled:cursor-wait"
                    />
                  ) : null}
                  <button onClick={() => selectCompany(c)} className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left">
                    <span className={'h-2 w-2 shrink-0 rounded-full ' + (active ? 'bg-emerald-400' : 'bg-slate-600')} />
                    <div className="min-w-0 flex-1">
                      <div className={'truncate text-xs font-medium ' + (sel ? 'text-emerald-200' : 'text-slate-200')}>{c.name}</div>
                      {c.companyCode ? <div className="truncate text-[10px] text-slate-500">{c.companyCode}</div> : null}
                    </div>
                  </button>
                  <button
                    onClick={() => openEdit(c)}
                    title="Edit company profile"
                    aria-label={'Edit ' + c.name + ' profile'}
                    className={
                      'mr-1.5 shrink-0 rounded-md p-1.5 text-slate-500 transition-all duration-200 hover:bg-slate-800 hover:text-emerald-300 ' +
                      (sel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
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
      <CompanyDrawer open={drawerOpen} company={drawerCompany} onClose={() => setDrawerOpen(false)} onSaved={afterSave} />
    </TierCard>
  )
}
