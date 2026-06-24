import { useEffect, useState } from 'react'
import { iam, isSuperAdmin, type AdminUser, type App, type Company, type GlobalRole } from '../lib/iam'
import { useSession } from '../context/SessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useToast } from '../components/Toast'
import { StyledSelect } from '../components/StyledSelect'
import { Toggle } from '../components/Toggle'
import { requireSuperAdmin } from '../lib/securityGate'
import { GLOBAL_ROLE_OPTIONS, initials } from '../lib/util'

type Access = 'none' | 'user' | 'appadmin'

// Tier 3 — Contextual IAM Control Panel (~35% slide-in). Manages the selected user's account
// role + per-app access (within the active company) + deletion-approval rights. Super-Admin-only
// actions are gated client-side (blueprint Part 4) and re-enforced server-side.
export function Tier3AccessPanel({
  user,
  company,
  reload,
}: {
  user: AdminUser
  company: Company
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
      const fresh = list.find((u) => u.id === user.id)
      if (fresh) selectUser(fresh)
      toast(label, 'ok')
    } catch (e: any) {
      toast(e?.message || 'Action failed', 'bad')
    } finally {
      setBusy(false)
    }
  }

  const setAccountRole = (role: string) => {
    if (!requireSuperAdmin(me, toast)) return
    run('Account role updated', () => iam.setGlobalRole(user.id, role as GlobalRole))
  }

  const accessFor = (appId: string): Access => {
    const ent = user.entitlements.find((e) => e.appId === appId)
    if (!ent) return 'none'
    if (ent.isAppAdmin) return 'appadmin'
    return ent.companies.some((c) => c.companyId === company.id) ? 'user' : 'none'
  }

  const setAccess = (app: App, value: Access) => {
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
        const curRole = ent?.companies.find((c) => c.companyId === company.id)?.role || 'ORDINARY_USER'
        await iam.setEntitlement(user.id, app.id, { entitled: true, isAppAdmin: value === 'appadmin' })
        await iam.setCompanyAccess(user.id, app.id, company.id, curRole)
      }
    })
  }

  const setCompanyRole = (app: App, role: string) =>
    run('Role updated', () => iam.setCompanyAccess(user.id, app.id, company.id, role))

  const setDeletion = (app: App, val: boolean) => {
    if (!requireSuperAdmin(me, toast)) return
    run('Deletion rights ' + (val ? 'granted' : 'revoked'), () =>
      iam.setEntitlement(user.id, app.id, { entitled: true, canApproveDeletions: val }),
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-emerald-50 text-sm font-medium text-emerald-700">{initials(user.fullName)}</div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-800">{user.fullName}</div>
          <div className="truncate text-xs text-slate-500">{user.email}</div>
        </div>
      </div>

      {/* Account (portal-wide) role */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Account role</div>
            <div className="mt-0.5 text-[11px] text-slate-500">Portal-wide — Super Admin &amp; Portal Admin live here, not per app.</div>
          </div>
          <StyledSelect value={String(user.globalRole)} onChange={setAccountRole} disabled={!superGate} className="w-40">
            {GLOBAL_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </StyledSelect>
        </div>
        {!superGate ? <div className="mt-2 text-[10px] text-slate-400">Only a Super Admin can change the account role.</div> : null}
      </div>

      {/* Per-app access within the active company */}
      <div>
        <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">App access · {company.name}</div>
        <div className="space-y-2.5">
          {apps.map((app) => {
            const acc = accessFor(app.id)
            const ent = user.entitlements.find((e) => e.appId === app.id)
            const curRole = ent?.companies.find((c) => c.companyId === company.id)?.role || 'ORDINARY_USER'
            return (
              <div key={app.id} className="rounded-xl border border-slate-100 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-slate-700">{app.name}</div>
                    <div className="truncate text-[10px] text-slate-400">{app.shortName || app.id}</div>
                  </div>
                  <StyledSelect value={acc} onChange={(v) => setAccess(app, v as Access)} disabled={acc === 'appadmin' && !superGate} className="w-44">
                    <option value="none">No Access</option>
                    <option value="user">User</option>
                    {superGate || acc === 'appadmin' ? <option value="appadmin">App Admin (all companies)</option> : null}
                  </StyledSelect>
                </div>
                {acc !== 'none' ? (
                  <div className="mt-2.5 space-y-2 border-t border-slate-50 pt-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">Role in {company.name}</span>
                      <StyledSelect value={curRole} onChange={(r) => setCompanyRole(app, r)} className="w-40">
                        {GLOBAL_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </StyledSelect>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">Deletion-approval rights</span>
                      <Toggle checked={!!ent?.canApproveDeletions} onChange={(v) => setDeletion(app, v)} disabled={!superGate} />
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
          {apps.length === 0 ? <div className="text-xs text-slate-400">No apps in the catalog.</div> : null}
        </div>
      </div>

      {busy ? <div className="text-[10px] text-slate-400">Saving…</div> : null}
    </div>
  )
}
