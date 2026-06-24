import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Shield, ArrowRight, Wrench, Settings2, LogOut } from 'lucide-react'
import { iam, canUsePortal, isSuperAdmin, type App, type Branding } from '../lib/iam'
import { useSession } from '../context/SessionContext'
import { initials } from '../lib/util'
import { PersonalSettings } from '../components/PersonalSettings'

// Apps that run their own backend session need a launch token handed to a callback route.
const HANDOFF_CALLBACK: Record<string, string> = { psjags01: '/psjags01/auth/callback' }

// The app launcher (post-login home) — ported from app.js:201-299.
export function Launcher({ onSignOut, onOpenAdmin }: { onSignOut: () => void; onOpenAdmin: () => void }) {
  const { me } = useSession()
  const [apps, setApps] = useState<App[]>([])
  const [, setBranding] = useState<Branding>({})
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)

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

  const hrefFor = (a: App) => {
    const mount = '/' + a.id
    const internal = a.url === mount || (a.url || '').startsWith(mount + '/') ? (a.url as string) : mount
    const tok = tokens[a.id]
    if (tok) return (HANDOFF_CALLBACK[a.id] || a.url || '') + '#token=' + tok
    return internal
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-600 text-[11px] font-medium text-white">WO</div>
          <div>
            <div className="text-xs font-medium text-slate-800">Workplace Operations</div>
            <div className="text-[10px] text-slate-400">Choose an app</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 transition-all duration-200 hover:bg-slate-50"
            title="Personal settings"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-50 text-[10px] font-medium text-emerald-700">{initials(me?.user.fullName)}</span>
            <span className="hidden text-left sm:block">
              <span className="block text-[11px] font-medium leading-tight text-slate-700">{me?.user.fullName}</span>
              <span className="block text-[10px] leading-tight text-slate-400">{me?.user.email}</span>
            </span>
            <Settings2 className="h-3.5 w-3.5 text-slate-400" />
          </button>
          <button onClick={onSignOut} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition-all duration-200 hover:bg-slate-50" title="Sign out" aria-label="Sign out">
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-6 py-8">
        <div className="mx-auto max-w-5xl">
          <h1 className="mb-5 text-base font-medium text-slate-800">Your apps</h1>
          {granted.length === 0 && !canUsePortal(me) ? (
            <p className="text-xs text-slate-400">No apps have been assigned to your account yet. Please contact an administrator.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {granted.map((a) => {
                const blocked = a.maintenanceMode && !isSuper
                if (blocked) {
                  return (
                    <div key={a.id} title={a.maintenanceMessage || 'Temporarily under maintenance.'} className="cursor-not-allowed rounded-xl border border-slate-100 bg-white p-4 opacity-60">
                      <Tile name={a.name} foot={<span className="flex items-center gap-1 text-rose-600"><Wrench className="h-3 w-3" /> Under maintenance</span>} />
                    </div>
                  )
                }
                return (
                  <a key={a.id} href={hrefFor(a)} className="group rounded-xl border border-slate-100 bg-white p-4 transition-all duration-200 hover:border-emerald-200 hover:shadow-sm">
                    <Tile
                      name={a.name}
                      foot={
                        a.maintenanceMode ? (
                          <span className="flex items-center gap-1 text-amber-600"><Wrench className="h-3 w-3" /> Maintenance — enter</span>
                        ) : (
                          <span className="flex items-center gap-1 text-emerald-700">Open <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" /></span>
                        )
                      }
                    />
                  </a>
                )
              })}
              {canUsePortal(me) ? (
                <button onClick={onOpenAdmin} className="group rounded-xl border-2 border-emerald-100 bg-emerald-50/40 p-4 text-left transition-all duration-200 hover:border-emerald-300">
                  <div className="mb-2 grid h-9 w-9 place-items-center rounded-lg bg-emerald-600 text-white"><Shield className="h-4 w-4" /></div>
                  <div className="text-xs font-medium text-slate-800">User Management</div>
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700">Manage <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" /></div>
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <PersonalSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

function Tile({ name, foot }: { name: string; foot: ReactNode }) {
  return (
    <>
      <div className="mb-2 grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-[11px] font-medium text-slate-500">{initials(name)}</div>
      <div className="truncate text-xs font-medium text-slate-800">{name}</div>
      <div className="mt-1 text-[11px]">{foot}</div>
    </>
  )
}
