import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Shield, ArrowRight, Wrench, Settings2, LogOut } from 'lucide-react'
import { iam, canUsePortal, isSuperAdmin, type App, type Branding } from '../lib/iam'
import { useSession } from '../context/SessionContext'
import { initials } from '../lib/util'
import { iconByName } from '../lib/appIcons'
import { clearBounceGuard } from '../lib/returnTo'
import { PersonalSettings } from '../components/PersonalSettings'
import { usePlatformName, useSite } from '../lib/platform'
import { MyTeam } from '../components/MyTeam'
import { Subscription } from '../components/Subscription'
import { CompanySettings } from '../components/CompanySettings'
import { SupportVisits } from '../components/SupportAccess'

// Apps that run their own backend session need a launch token handed to a callback route.
const HANDOFF_CALLBACK: Record<string, string> = { psjags01: '/psjags01/auth/callback' }

// The app launcher (post-login home) — ported from app.js:201-299.
export function Launcher({ onSignOut, onOpenAdmin }: { onSignOut: () => void; onOpenAdmin: () => void }) {
  const platformName = usePlatformName()
  // The subscription site (superlisting.net) wears the platform's name; True Eco's portal keeps its own.
  const accountSite = useSite() === 'account'
  const { me } = useSession()
  const [apps, setApps] = useState<App[]>([])
  const [, setBranding] = useState<Branding>({})
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)

  // SaaS stage 3: free-trial banner (nothing shows when no company of mine is on a trial).
  const [trial, setTrial] = useState<{ companyId: string; name: string; daysLeft: number | null; lapsed: boolean; closedApps?: string[] }[]>([])
  // SaaS stage 4: "My team" for a customer's administrator (the list is empty / 404 elsewhere).
  const [teams, setTeams] = useState<{ companyId: string; name: string; kind?: string }[]>([])
  const [teamOpen, setTeamOpen] = useState<string | null>(null)
  const [subOpen, setSubOpen] = useState<string | null>(null)
  // The CUSTOMER PORTAL (2026-10-14): a customer's administrator gets tabs for their own company —
  // Apps · Team · Subscription · Company settings · Support visits. Staff who are not the
  // administrator, and the owner's own companies, keep the plain launcher.
  type Tab = 'apps' | 'team' | 'subscription' | 'company' | 'support'
  const [tab, setTab] = useState<Tab>('apps')
  const customerCos = teams.filter((t) => t.kind === 'customer')
  const [coId, setCoId] = useState<string | null>(null)
  const activeCo = customerCos.find((c) => c.companyId === coId) || customerCos[0] || null
  const internalTeams = teams.filter((t) => t.kind !== 'customer')
  // "Add company" (2026-10-22): another company under the same login, subscribed from its own tab.
  const [addingCo, setAddingCo] = useState(false)
  const [newCoName, setNewCoName] = useState('')
  const [addCoBusy, setAddCoBusy] = useState(false)
  const [addCoErr, setAddCoErr] = useState('')
  const addCompany = async () => {
    setAddCoBusy(true); setAddCoErr('')
    try {
      const co = await iam.addCompany(newCoName.trim())
      setTeams((ts) => [...ts, co])
      setCoId(co.companyId); setTab('subscription')
      setAddingCo(false); setNewCoName('')
    } catch (e: any) {
      setAddCoErr(e?.message || 'Could not add the company')
    } finally { setAddCoBusy(false) }
  }
  // One platform: my open support visits (platform team only; others get [] / 403 → nothing shown).
  const [visits, setVisits] = useState<{ id: string; companyName: string; expiresAt: string }[]>([])
  useEffect(() => {
    if (!canUsePortal(me)) return
    iam.mySupport().then((r) => setVisits(Array.isArray(r) ? r : [])).catch(() => setVisits([]))
  }, [me])
  const endVisit = (id: string) => iam.endSupport(id).then(() => setVisits((v) => v.filter((x) => x.id !== id))).catch(() => {})
  // Back from Billplz (stage 5): ?billing=paid|unpaid|unknown — say what happened, then tidy the URL.
  const [billingNote] = useState(() => new URLSearchParams(location.search).get('billing'))
  useEffect(() => {
    if (billingNote) history.replaceState(null, '', location.pathname)
  }, [billingNote])
  useEffect(() => {
    iam.myTeams().then((r) => setTeams(Array.isArray(r) ? r : [])).catch(() => setTeams([]))
  }, [])

  useEffect(() => {
    iam.myTrial().then((r) => setTrial(r.companies || [])).catch(() => setTrial([]))
  }, [])

  useEffect(() => {
    iam.listApps().then(setApps).catch(() => setApps([]))
    iam.getBranding().then(setBranding).catch(() => {})
  }, [])

  const isSuper = isSuperAdmin(me)
  const catalog = useMemo(() => Object.fromEntries(apps.map((a) => [a.id, a])), [apps])

  // Apps the user can open = entitled AND has ≥1 company access AND live; name-sorted.
  const granted = useMemo(() => {
    if (!me) return [] as App[]
    return Object.entries(me.apps)
      .filter(([, info]) => info.companies && info.companies.length > 0)
      .map(([id]) => catalog[id])
      .filter(Boolean)
      .filter((a) => a.active !== false)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: 'base' }))
  }, [me, catalog])

  // Mint launch tokens for external / handoff apps (skip maintenance the user can't bypass).
  useEffect(() => {
    if (!me) return
    granted.forEach((a) => {
      if ((a.maintenanceMode && !isSuper) || tokens[a.id]) return
      const needsToken = /^https?:\/\//.test(a.url || '') || HANDOFF_CALLBACK[a.id]
      if (!needsToken) return
      const companyId = me.apps[a.id]?.companies[0]?.companyId
      if (!companyId) return
      iam
        .appAccessToken(a.id, companyId)
        .then((r) => setTokens((t) => ({ ...t, [a.id]: r.accessToken })))
        .catch(() => {})
    })
    // tokens intentionally omitted from deps — the per-app guard prevents re-minting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [granted, me, isSuper])

  const internalHref = (a: App) => {
    const mount = '/' + a.id
    return a.url === mount || (a.url || '').startsWith(mount + '/') ? (a.url as string) : mount
  }
  const tokenHref = (a: App, tok: string) => (HANDOFF_CALLBACK[a.id] || a.url || '') + '#token=' + tok

  const hrefFor = (a: App) => {
    const tok = tokens[a.id]
    return tok ? tokenHref(a, tok) : internalHref(a)
  }

  // The launch-token race (owner report 2026-08-14: "multiple clicks to reach PSM"): tokens
  // are minted in the background after the launcher renders, and a quick first click used to
  // navigate on the bare mount — the app then bounced back here and the user had to click the
  // tile again. Now a click that beats the mint holds the navigation, mints right then, and
  // goes straight to the app's callback. One click, whatever the timing.
  const [openingId, setOpeningId] = useState<string | null>(null)
  const openApp = (e: { preventDefault: () => void }, a: App) => {
    clearBounceGuard()
    const needsToken = /^https?:\/\//.test(a.url || '') || HANDOFF_CALLBACK[a.id]
    if (!needsToken || tokens[a.id]) return // href already carries the right door
    e.preventDefault()
    if (openingId) return // one launch at a time
    const companyId = me?.apps[a.id]?.companies[0]?.companyId
    if (!companyId) { window.location.assign(internalHref(a)); return }
    setOpeningId(a.id)
    iam.appAccessToken(a.id, companyId)
      .then((r) => window.location.assign(tokenHref(a, r.accessToken)))
      // Minting failed → the old cold landing, which the ?redirect_uri handoff now recovers.
      .catch(() => window.location.assign(internalHref(a)))
  }

  return (
    <div className="flex h-screen flex-col bg-slate-950">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-6">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500 text-[11px] font-medium text-slate-950">{accountSite ? brandInitials(platformName) : 'WO'}</div>
          <div>
            <div className="text-xs font-medium text-slate-200">{accountSite ? platformName : 'Workplace Operations'}</div>
            <div className="text-[10px] text-slate-500">Choose an app</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-800 px-2.5 py-1.5 transition-all duration-200 hover:bg-slate-800/60"
            title="Personal settings"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500/15 text-[10px] font-medium text-emerald-300">{initials(me?.user.fullName)}</span>
            <span className="hidden text-left sm:block">
              <span className="block text-[11px] font-medium leading-tight text-slate-200">{me?.user.fullName}</span>
              <span className="block text-[10px] leading-tight text-slate-500">{me?.user.email}</span>
            </span>
            <Settings2 className="h-3.5 w-3.5 text-slate-500" />
          </button>
          <button onClick={onSignOut} className="rounded-lg border border-slate-800 p-2 text-slate-400 transition-all duration-200 hover:bg-slate-800/60" title="Sign out" aria-label="Sign out">
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-6 py-8">
        <div className="mx-auto max-w-5xl">
          {trial.map((t) => (
            <div
              key={t.companyId}
              role={t.lapsed ? 'alert' : 'status'}
              className={`mb-4 rounded-lg border px-4 py-3 text-xs ${t.lapsed ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}
            >
              {t.lapsed
                ? <>The apps for <b>{t.name}</b> are closed until it is subscribed. Open Subscription to continue — your data is kept.</>
                : t.closedApps && t.closedApps.length
                  ? <>{t.name} does not subscribe to {t.closedApps.join(' and ')}, so {t.closedApps.length === 1 ? 'it is' : 'they are'} closed. Add {t.closedApps.length === 1 ? 'it' : 'them'} in Subscription — your data is kept.</>
                : t.daysLeft != null
                  ? <>Free trial for <b>{t.name}</b>: {t.daysLeft === 1 ? '1 day' : `${t.daysLeft} days`} left.</>
                  : null}
            </div>
          ))}
          {visits.map((v) => (
            <div key={v.id} role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
              <span>Support access open: <b>{v.companyName}</b> until {new Date(v.expiresAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}. It shows in your app switchers as “(support)”.</span>
              <button onClick={() => endVisit(v.id)} className="ml-auto rounded-lg border border-amber-500/40 px-3 py-1 text-xs hover:bg-amber-500/10">End now</button>
            </div>
          ))}
          {billingNote ? (
            <div role="status" className={`mb-4 rounded-lg border px-4 py-3 text-xs ${billingNote === 'paid' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/40 bg-amber-500/10 text-amber-200'}`}>
              {billingNote === 'paid' ? 'Payment received — thank you. Your subscription is active.'
                : billingNote === 'unpaid' ? 'The payment was not completed. You can try again from Subscription.'
                : 'We could not confirm the payment yet. If you paid, it will show within a few minutes.'}
            </div>
          ) : null}
          {internalTeams.length > 0 && !activeCo ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {internalTeams.map((t) => (
                <span key={t.companyId} className="flex gap-2">
                  <button onClick={() => setTeamOpen(t.companyId)}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition-all duration-200 hover:bg-slate-800/60">
                    My team{teams.length > 1 ? ` · ${t.name}` : ''}
                  </button>
                  {t.kind !== 'internal' ? <button onClick={() => setSubOpen(t.companyId)}
                    className="rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-all duration-200 hover:bg-emerald-500/10">
                    Subscription{teams.length > 1 ? ` · ${t.name}` : ''}
                  </button> : null}
                </span>
              ))}
            </div>
          ) : null}
          {teamOpen ? <MyTeam companyId={teamOpen} onClose={() => setTeamOpen(null)} /> : null}
          {subOpen ? <Subscription companyId={subOpen} onClose={() => setSubOpen(null)} /> : null}
          {activeCo ? (
            <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
              {customerCos.length > 1 ? (
                <select aria-label="Company" value={activeCo.companyId} onChange={(e) => setCoId(e.target.value)}
                  className="mr-2 rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-1.5 text-xs text-slate-200">
                  {customerCos.map((c) => <option key={c.companyId} value={c.companyId}>{c.name}</option>)}
                </select>
              ) : <span className="mr-2 text-xs font-medium text-slate-300">{activeCo.name}</span>}
              <button onClick={() => { setAddingCo(true); setAddCoErr('') }} title="Set up another company under this login"
                className="mr-2 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800">+ Add company</button>
              {([['apps', 'Apps'], ['team', 'Team'], ['subscription', 'Subscription'], ['company', 'Company settings'], ['support', 'Support visits']] as [Tab, string][]).map(([id, label]) => (
                <button key={id} onClick={() => setTab(id)}
                  className={'rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ' + (tab === id ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200')}>
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          {addingCo ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" onClick={() => !addCoBusy && setAddingCo(false)} />
              <form onSubmit={(e) => { e.preventDefault(); if (newCoName.trim()) addCompany() }}
                className="relative z-10 w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
                <div className="mb-1 text-sm font-medium text-slate-100">Add a company</div>
                <p className="mb-3 text-xs leading-relaxed text-slate-400">
                  A separate company under your login, with its own team, data, subscription and receipts.
                  It has no free trial: its apps open once you subscribe it.
                </p>
                <input autoFocus value={newCoName} onChange={(e) => setNewCoName(e.target.value)} maxLength={120} placeholder="Company name, e.g. ABC TRADING SDN BHD"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                {addCoErr ? <div className="mt-2 text-xs text-rose-300">{addCoErr}</div> : null}
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setAddingCo(false)} disabled={addCoBusy} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
                  <button type="submit" disabled={addCoBusy || !newCoName.trim()} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                    {addCoBusy ? 'Adding…' : 'Add company'}
                  </button>
                </div>
              </form>
            </div>
          ) : null}
          {activeCo && tab === 'team' ? <MyTeam key={activeCo.companyId} companyId={activeCo.companyId} onClose={() => setTab('apps')} inline /> : null}
          {activeCo && tab === 'subscription' ? <Subscription key={activeCo.companyId} companyId={activeCo.companyId} onClose={() => setTab('apps')} inline /> : null}
          {activeCo && tab === 'company' ? <CompanySettings key={activeCo.companyId} companyId={activeCo.companyId} /> : null}
          {activeCo && tab === 'support' ? <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><SupportVisits key={activeCo.companyId} companyId={activeCo.companyId} /></div> : null}
          {!activeCo || tab === 'apps' ? <>
          <h1 className="mb-5 text-base font-medium text-slate-200">Your apps</h1>
          {granted.length === 0 && !canUsePortal(me) ? (
            <p className="text-xs text-slate-500">No apps have been assigned to your account yet. Please contact an administrator.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {granted.map((a) => {
                const blocked = a.maintenanceMode && !isSuper
                if (blocked) {
                  return (
                    <div key={a.id} title={a.maintenanceMessage || 'Temporarily under maintenance.'} className="cursor-not-allowed rounded-xl border border-slate-800 bg-slate-900/60 p-4 opacity-60">
                      <Tile name={a.name} icon={a.icon} foot={<span className="flex items-center gap-1 text-rose-400"><Wrench className="h-3 w-3" /> Under maintenance</span>} />
                    </div>
                  )
                }
                return (
                  // Opening an app from here is a deliberate launch: drop the one-shot ?return
                  // bounce guard so a legitimate deep-link bounce is allowed again straight away.
                  <a key={a.id} href={hrefFor(a)} onClick={(e) => openApp(e, a)} className="group rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition-all duration-200 hover:border-slate-700 hover:shadow-sm">
                    <Tile
                      name={a.name}
                      icon={a.icon}
                      foot={
                        openingId === a.id ? (
                          <span className="flex items-center gap-1 text-emerald-300">Opening…</span>
                        ) : a.maintenanceMode ? (
                          <span className="flex items-center gap-1 text-amber-400"><Wrench className="h-3 w-3" /> Maintenance — enter</span>
                        ) : (
                          <span className="flex items-center gap-1 text-emerald-300">Open <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" /></span>
                        )
                      }
                    />
                  </a>
                )
              })}
              {canUsePortal(me) ? (
                <button onClick={onOpenAdmin} className="group rounded-xl border-2 border-emerald-500/30 bg-emerald-500/15 p-4 text-left transition-all duration-200 hover:border-emerald-500/50">
                  <div className="mb-2 grid h-9 w-9 place-items-center rounded-lg bg-emerald-500 text-slate-950"><Shield className="h-4 w-4" /></div>
                  <div className="text-[17px] font-medium leading-normal text-slate-100">User Management</div>
                  <div className="mt-3 flex items-center gap-1 text-[11px] text-emerald-300">Manage <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" /></div>
                </button>
              ) : null}
            </div>
          )}
          </> : null}
        </div>
      </div>

      <footer className="shrink-0 border-t border-slate-800 bg-slate-900 py-2 text-center text-[11px] font-semibold text-slate-500">
        {platformName}
      </footer>

      <PersonalSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

function Tile({ name, icon, foot }: { name: string; icon?: string; foot: ReactNode }) {
  const Icon = iconByName(icon)
  return (
    <>
      <div className="mb-2 grid h-9 w-9 place-items-center rounded-lg bg-slate-800 text-slate-300">
        <Icon className="h-4 w-4" />
      </div>
      <div className="truncate text-[17px] font-medium leading-normal text-slate-200">{name}</div>
      <div className="mt-3 text-[11px]">{foot}</div>
    </>
  )
}

/** Two-letter mark for the header tile, e.g. "SuperListing.net" -> "SL". */
function brandInitials(name: string): string {
  const caps = name.replace(/\.[a-z]+$/i, '').match(/[A-Z]/g) || []
  return (caps.length >= 2 ? caps.slice(0, 2).join('') : name.slice(0, 2)).toUpperCase() || 'SL'
}
