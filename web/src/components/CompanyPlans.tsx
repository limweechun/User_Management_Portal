import { useEffect, useState } from 'react'
import { iam, type CompanyPlanRow } from '../lib/iam'
import { useToast } from './Toast'

/**
 * SaaS stage 4 (2026-10-13): a company's plan per app, with users used / allowed.
 * Shown only on a SaaS deployment. A Super Admin sets the plan until billing (stage 5) does.
 * "No plan" = no limits (how every company on the owner's own deployment runs).
 */
export function CompanyPlans({ companyId }: { companyId: string }) {
  const { toast } = useToast()
  const [rows, setRows] = useState<CompanyPlanRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = () => iam.companyPlans(companyId).then(setRows).catch(() => setRows([]))
  useEffect(() => { load() }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (r: CompanyPlanRow, plan: string | null, extraUsers: number) => {
    setBusy(r.appId)
    try {
      await iam.setCompanyPlan(companyId, r.appId, { plan, extraUsers })
      toast(`${r.appName}: plan saved`, 'ok')
      await load()
    } catch (e: any) {
      toast(e?.message || 'Could not save the plan', 'bad')
    } finally { setBusy(null) }
  }

  const sel = 'rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none'
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">Subscription plans</div>
      {rows == null ? <div className="text-xs text-slate-500">Loading…</div>
        : rows.length === 0 ? <div className="text-xs text-slate-500">This company uses no apps yet.</div>
        : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.appId} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="w-40 truncate text-slate-200">{r.appName}</span>
                <select aria-label={`${r.appName} plan`} className={sel} disabled={busy === r.appId} value={r.plan ?? ''}
                  onChange={(e) => save(r, e.target.value || null, r.extraUsers)}>
                  <option value="">No plan (no limits)</option>
                  <option value="STARTER">Starter</option>
                  <option value="PRO">Pro</option>
                  <option value="BUSINESS">Business</option>
                </select>
                {r.extraUsersAllowed && r.plan ? (
                  <label className="flex items-center gap-1 text-slate-400">
                    + extra users
                    <input type="number" min={0} max={500} defaultValue={r.extraUsers} disabled={busy === r.appId}
                      onBlur={(e) => { const n = Math.max(0, Math.floor(Number(e.target.value) || 0)); if (n !== r.extraUsers) save(r, r.plan, n) }}
                      className={sel + ' w-16'} />
                  </label>
                ) : null}
                <span className={'ml-auto ' + (r.seats != null && r.used >= r.seats ? 'text-amber-300' : 'text-slate-400')}>
                  {r.seats != null ? `${r.used} of ${r.seats} users` : `${r.used} users`}
                </span>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
