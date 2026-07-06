import { useEffect, useState } from 'react'
import { Shield, Check, X as XIcon } from 'lucide-react'
import { iam, isSuperAdmin, type AdminUser, type App, type Company } from '../lib/iam'
import { useSession } from '../context/SessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useToast } from '../components/Toast'
import { StyledSelect } from '../components/StyledSelect'
import { Toggle } from '../components/Toggle'
import { TierCard } from '../components/TierCard'
import { requireSuperAdmin } from '../lib/securityGate'
import { initials } from '../lib/util'

type Access = 'none' | 'user' | 'appadmin'

// Tier 3 — App Access (right column). For the user picked in Tier 1, within the company
// picked in Tier 2: one dropdown per app — No Access / Ordinary User / App Admin — plus
// deletion-approval rights. Global role and account status live in Tier 1; finer role
// titles are assigned INSIDE each app by its admins. Super-Admin-only actions are gated
// client-side (and re-enforced server-side). Every control writes immediately.
export function Tier3AccessPanel({
  user,
  company,
  reload,
}: {
  user: AdminUser | null
  company: Company | null
  reload: () => Promise<AdminUser[]>
}) {
  const { me } = useSession()
  const { selectUser } = useWorkspace()
  const { toast } = useToast()
  const [apps, setApps] = useState<App[]>([])
  const [busy, setBusy] = useState(false)
  const superGate = isSuperAdmin(me)

  useEffect(() => {
    iam.listApps().then((a) => setApps(a.filter((x) => x.active !== false))).catch(() => {})
  }, [])

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      const list = await reload()
      const fresh = list.find((u) => u.id === user?.id)
      if (fresh) selectUser(fresh)
      toast(label, 'ok')
    } catch (e: any) {
      toast(e?.message || 'Action failed', 'bad')
    } finally {
      setBusy(false)
    }
  }

  const accessFor = (appId: string): Access => {
    const ent = user?.entitlements.find((e) => e.appId === appId)
    if (!ent) return 'none'
    if (ent.isAppAdmin) return 'appadmin'
    return ent.companies.some((c) => c.companyId === company?.id) ? 'user' : 'none'
  }

  const setAccess = (app: App, value: Access) => {
    if (!user || !company) return
    const ent = user.entitlements.find((e) => e.appId === app.id)
    // Granting App Admin OR demoting away from it crosses the app-wide admin boundary, which is
    // Super-Admin-only on the server — gate it client-side either way for a friendly toast.
    const crossesAdmin = value === 'appadmin' || !!ent?.isAppAdmin
    if (crossesAdmin && !requireSuperAdmin(me, toast)) return
    run('Updated ' + (app.shortName || app.name), async () => {
      if (value === 'none') {
        // App Admin is a single app-wide flag (no company rows), so "No Access" on an app admin
        // must fully revoke the entitlement (the server cascades all access) — otherwise the
        // orphaned entitlement persists and the dropdown reverts to App Admin.
        if (ent?.isAppAdmin) {
          await iam.setEntitlement(user.id, app.id, { entitled: false })
        } else {
          await iam.removeCompanyAccess(user.id, app.id, company.id)
          if (ent && ent.companies.length <= 1) await iam.setEntitlement(user.id, app.id, { entitled: false })
        }
      } else {
        // Grants land as Ordinary User (or keep an already-assigned title) — refined
        // role titles are managed inside each app's own App Roles screen, not here.
        // Only send the isAppAdmin flag when the value actually crosses the admin
        // boundary: the server treats ANY boolean as flag-setting (Super-Admin-only),
        // so including `isAppAdmin: false` on a plain grant 403s a Portal Admin.
        const curRole = ent?.companies.find((c) => c.companyId === company.id)?.role || 'ORDINARY_USER'
        await iam.setEntitlement(user.id, app.id, crossesAdmin ? { entitled: true, isAppAdmin: value === 'appadmin' } : { entitled: true })
        await iam.setCompanyAccess(user.id, app.id, company.id, curRole)
      }
    })
  }

  const setDeletion = (app: App, val: boolean) => {
    if (!user) return
    if (!requireSuperAdmin(me, toast)) return
    run('Deletion rights ' + (val ? 'granted' : 'revoked'), () =>
      iam.setEntitlement(user.id, app.id, { entitled: true, canApproveDeletions: val }),
    )
  }

  return (
    <TierCard icon={<Shield className="h-3.5 w-3.5" />} label="Tier 3: App Access" className="w-[720px] shrink-0">
      {!user || !company ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-slate-500">
          {!user
            ? 'Select a user in the directory (Tier 1) to manage their access.'
            : 'Now select a company (Tier 2) — the app access below applies to the user within that company.'}
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-3 px-4 py-3.5">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500/15 text-xs font-semibold text-emerald-300">{initials(user.fullName)}</div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-100">{user.fullName}</div>
              <div className="truncate text-[11px] text-slate-500">{user.email}</div>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
            {/* Per-app access within the Tier-2 company (account status lives in Tier 1) */}
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">App Access · {company.name}</div>
            <div className="space-y-2.5">
              {apps.map((app) => {
                const acc = accessFor(app.id)
                const ent = user.entitlements.find((e) => e.appId === app.id)
                const granted = acc !== 'none'
                const canDelete = !!ent?.canApproveDeletions
                return (
                  <div key={app.id} className={'rounded-xl border p-3 transition-all duration-200 ' + (granted ? 'border-slate-700 bg-slate-800/40' : 'border-slate-800 bg-slate-900/40')}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-slate-700/60 text-[10px] font-semibold text-slate-300">{initials(app.shortName || app.name)}</div>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-slate-200">{app.name}</div>
                          <div className="text-[10px] text-slate-500">{acc === 'appadmin' ? 'App-wide administrator' : acc === 'user' ? 'Member of ' + company.name : 'No access in ' + company.name}</div>
                        </div>
                      </div>
                      <StyledSelect tone="dark" value={acc} onChange={(v) => setAccess(app, v as Access)} disabled={acc === 'appadmin' && !superGate} className="w-36 shrink-0">
                        <option value="none">No Access</option>
                        <option value="user">Ordinary User</option>
                        {superGate || acc === 'appadmin' ? <option value="appadmin">App Admin</option> : null}
                      </StyledSelect>
                    </div>
                    {granted ? (
                      <div className="mt-2.5 space-y-2 border-t border-slate-700/60 pt-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className={'inline-flex items-center gap-1 text-[11px] font-medium ' + (canDelete ? 'text-emerald-400' : 'text-rose-400')}>
                            {canDelete ? <Check className="h-3 w-3" /> : <XIcon className="h-3 w-3" />}
                            Deletion-Approval {canDelete ? 'Authorized' : 'Restricted'}
                          </span>
                          <Toggle checked={canDelete} onChange={(v) => setDeletion(app, v)} disabled={!superGate} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
              {apps.length === 0 ? <div className="text-xs text-slate-500">No apps in the catalog.</div> : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between border-t border-slate-800 px-4 py-2.5 text-[10px]">
            <span className="text-slate-500">Changes apply instantly &amp; are audited</span>
            <span className={busy ? 'text-amber-400' : 'text-emerald-400'}>{busy ? 'Saving…' : '✓ All changes saved'}</span>
          </div>
        </>
      )}
    </TierCard>
  )
}

