import { useEffect, useMemo, useState } from 'react'
import { iam, type Company, type CustomerRow } from '../lib/iam'
import { CompanyDrawer } from '../components/CompanyDrawer'
import { useToast } from '../components/Toast'

/**
 * Customers (platform team, 2026-10-13): every company that signed up — plan, trial / paid,
 * users, last payment. Account facts only; their data stays closed (Support access is the door,
 * on the company's profile, opened from here).
 */
const STATE: Record<string, [string, string]> = {
  paid: ['Paid', 'bg-emerald-500/15 text-emerald-300'],
  trial: ['Trial', 'bg-sky-500/15 text-sky-300'],
  lapsed: ['Ended', 'bg-amber-500/15 text-amber-300'],
  none: ['—', 'bg-slate-700/60 text-slate-300'],
}
const day = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const rm = (sen: number) => 'RM' + (sen / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const PLAN_SHORT: Record<string, string> = { STARTER: 'Starter', PRO: 'Pro', BUSINESS: 'Business' }
const APP_SHORT: Record<string, string> = { psjags01: 'PSM', p01: 'Procurement', pm01: 'Property' }

export function Customers() {
  const { toast } = useToast()
  const [rows, setRows] = useState<CustomerRow[] | null>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Company | null>(null)

  const load = () => iam.customers().then(setRows).catch((e) => { toast(e?.message || 'Could not load customers', 'bad'); setRows([]) })
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => (rows || []).filter((r) => !q.trim() || `${r.name} ${r.companyCode || ''} ${r.email || ''}`.toLowerCase().includes(q.trim().toLowerCase())), [rows, q])

  const openCompany = async (id: string) => {
    try {
      const all = await iam.listCompanies()
      const c = all.find((x) => x.id === id)
      if (c) setOpen(c); else toast('Company not found', 'bad')
    } catch (e: any) { toast(e?.message || 'Could not open the company', 'bad') }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-medium text-slate-200">Customers</h1>
          <p className="text-[11px] text-slate-500">Companies that signed up. Their data is closed to the platform team — open a company for its plans and Support access.</p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ID or email"
          className="w-64 max-w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
      </div>
      {!rows ? <div className="text-xs text-slate-500">Loading…</div> : shown.length === 0 ? <div className="text-xs text-slate-500">No customers yet.</div> : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-slate-900 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Company</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Plans</th>
                <th className="px-3 py-2">Users</th><th className="px-3 py-2">Trial ends / paid until</th><th className="px-3 py-2">Last payment</th><th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {shown.map((r) => {
                const [label, cls] = STATE[r.state] || STATE.none
                return (
                  <tr key={r.id} className="text-slate-300">
                    <td className="px-3 py-2"><div className="text-slate-100">{r.name}</div><div className="text-[11px] text-slate-500">{[r.companyCode, r.email].filter(Boolean).join(' · ')}</div></td>
                    <td className="px-3 py-2"><span className={'rounded px-1.5 py-0.5 text-[10px] ' + cls}>{label}</span></td>
                    <td className="px-3 py-2">{r.plans.map((p) => `${APP_SHORT[p.appId] || p.appId} ${PLAN_SHORT[p.plan] || p.plan}`).join(' · ') || '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{r.users}</td>
                    <td className="px-3 py-2">{r.state === 'paid' ? day(r.paidUntil) : day(r.trialEndsAt)}</td>
                    <td className="px-3 py-2 tabular-nums">{r.lastPayment ? `${rm(r.lastPayment.amountSen)} · ${day(r.lastPayment.paidAt)}` : '—'}</td>
                    <td className="px-3 py-2 text-right"><button onClick={() => openCompany(r.id)} className="rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-slate-800">Open</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <CompanyDrawer open={!!open} company={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load() }} />
    </div>
  )
}
