import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { iam, type BillingInfo, type BillingQuote } from '../lib/iam'
import { openReceipt } from '../lib/receipt'
import { useToast } from './Toast'

/**
 * Subscription (SaaS stage 5, 2026-10-13): the company's administrator chooses plans, sees the
 * price the SERVER works out, and pays on Billplz. Billplz sends them back to the portal with
 * ?billing=paid; the plans apply when Billplz confirms (signed), not because this page says so.
 */
const PLANS = [['STARTER', 'Starter'], ['PRO', 'Pro'], ['BUSINESS', 'Business']] as const
const rm = (sen: number) => 'RM' + (sen / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '')

type Pick = { on: boolean; plan: string; properties: number; extraUsers: number }

export function Subscription({ companyId, onClose, inline = false }: { companyId: string; onClose: () => void; /** customer portal tab instead of a pop-up */ inline?: boolean }) {
  const { toast } = useToast()
  const [info, setInfo] = useState<BillingInfo | null>(null)
  const [period, setPeriod] = useState<'month' | 'year'>('month')
  const [picks, setPicks] = useState<Record<string, Pick>>({})
  const [q, setQ] = useState<BillingQuote | null>(null)
  const [qErr, setQErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    iam.billing(companyId).then((b) => {
      setInfo(b)
      setPicks(Object.fromEntries(b.apps.map((a) => [a.appId, {
        on: true,
        plan: a.current?.plan || 'PRO',
        properties: a.current?.properties || 1,
        extraUsers: a.current?.extraUsers || 0,
      }])))
    }).catch((e) => { toast(e?.message || 'Could not load the subscription', 'bad'); onClose() })
  }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => Object.entries(picks).filter(([, p]) => p.on).map(([appId, p]) => {
    const a = info?.apps.find((x) => x.appId === appId)
    return { appId, plan: p.plan, ...(a?.perProperty ? { properties: p.properties, extraUsers: p.extraUsers } : {}) }
  }), [picks, info])

  // The price always comes from the server.
  useEffect(() => {
    if (!info || !items.length) { setQ(null); return }
    let live = true
    const t = window.setTimeout(() => {
      iam.billingQuote(companyId, { period, items })
        .then((r) => { if (live) { setQ(r); setQErr('') } })
        .catch((e) => { if (live) { setQ(null); setQErr(e?.message || 'Could not price that') } })
    }, 250)
    return () => { live = false; window.clearTimeout(t) }
  }, [companyId, info, items, period])

  const pay = async () => {
    setBusy(true)
    try {
      const r = await iam.billingCheckout(companyId, { period, items })
      window.location.href = r.url
    } catch (e: any) {
      toast(e?.message || 'Could not start the payment', 'bad'); setBusy(false)
    }
  }

  const set = (appId: string, patch: Partial<Pick>) => setPicks((p) => ({ ...p, [appId]: { ...p[appId], ...patch } }))
  const sel = 'rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none'
  const c = info?.company

  return (
    <div className={inline ? "" : "fixed inset-0 z-50 flex items-center justify-center p-4"}>
      {!inline && <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" onClick={onClose} />}
      <div className={inline ? "flex w-full flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900" : "relative z-10 flex max-h-[90vh] w-full max-w-[784px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"}>
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="truncate text-sm font-medium text-slate-100">Subscription{c ? ' · ' + c.name : ''}</div>
          {!inline && <button onClick={onClose} className="text-slate-400 hover:text-slate-200" aria-label="Close"><X className="h-4 w-4" /></button>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!info || !c ? <div className="text-xs text-slate-500">Loading…</div> : (
            <>
              <div className="mb-4 rounded-xl border border-slate-800 bg-slate-800/40 p-3 text-xs text-slate-300">
                {c.paidUntil && new Date(c.paidUntil) > new Date()
                  ? <>Paid until <b className="text-emerald-300">{day(c.paidUntil)}</b>. Paying again adds to that date.</>
                  : c.trialDaysLeft != null && c.trialDaysLeft > 0
                    ? <>Free trial: <b className="text-emerald-300">{c.trialDaysLeft === 1 ? '1 day' : `${c.trialDaysLeft} days`}</b> left. Subscribe any time — nothing is lost.</>
                    : <>Your apps are closed until you subscribe. Your data is kept.</>}
                {info.sandbox ? <div className="mt-1 text-amber-300">Test mode — no real money is taken.</div> : null}
              </div>

              <div className="mb-3 inline-flex rounded-lg border border-slate-700 p-0.5 text-xs">
                {(['month', 'year'] as const).map((p) => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={'rounded-md px-3 py-1.5 ' + (period === p ? 'bg-emerald-500 font-medium text-slate-950' : 'text-slate-300')}>
                    {p === 'month' ? 'Monthly' : 'Yearly · 2 months free'}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                {info.apps.map((a) => {
                  const p = picks[a.appId]
                  if (!p) return null
                  return (
                    <div key={a.appId} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 p-3 text-xs">
                      <label className="flex w-44 items-center gap-2 text-slate-200">
                        <input type="checkbox" checked={p.on} onChange={(e) => set(a.appId, { on: e.target.checked })} /> {a.name}
                      </label>
                      <select aria-label={`${a.name} plan`} className={sel} disabled={!p.on} value={p.plan} onChange={(e) => set(a.appId, { plan: e.target.value })}>
                        {PLANS.map(([v, l]) => <option key={v} value={v}>{l} · {rm(a.monthlySen[v])}{a.perProperty ? '/property' : ''}/month</option>)}
                      </select>
                      {a.perProperty ? (
                        <>
                          <label className="flex items-center gap-1 text-slate-400">Properties
                            <input type="number" min={1} max={10000} className={sel + ' w-20'} disabled={!p.on} value={p.properties}
                              onChange={(e) => set(a.appId, { properties: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
                          </label>
                          <label className="flex items-center gap-1 text-slate-400">Extra users
                            <input type="number" min={0} max={500} className={sel + ' w-16'} disabled={!p.on} value={p.extraUsers}
                              onChange={(e) => set(a.appId, { extraUsers: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
                          </label>
                        </>
                      ) : null}
                      <span className={'text-[11px] ' + (a.open ? 'text-emerald-300' : 'text-amber-300')}>
                        {a.open ? (a.paidUntil && new Date(a.paidUntil) > new Date() ? `Paid until ${day(a.paidUntil)}` : 'Open') : 'Not subscribed — closed'}
                      </span>
                      {a.setupFeeSen ? <span className="ml-auto text-[11px] text-slate-500">+ one-off setup {rm(a.setupFeeSen)}</span> : null}
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 rounded-xl border border-slate-700 bg-slate-800/40 p-3">
                {qErr ? <div className="text-xs text-amber-300">{qErr}</div> : !q ? <div className="text-xs text-slate-500">Choose at least one app.</div> : (
                  <>
                    {q.lines.map((l, i) => (
                      <div key={i} className="flex justify-between gap-3 py-0.5 text-xs text-slate-300"><span>{l.label}</span><span className="tabular-nums">{rm(l.amountSen)}</span></div>
                    ))}
                    <div className="mt-2 flex justify-between border-t border-slate-700 pt-2 text-sm font-medium text-slate-100"><span>Total</span><span className="tabular-nums">{rm(q.totalSen)}</span></div>
                  </>
                )}
                <div className="mt-3 flex justify-end">
                  <button disabled={!q || busy || !info.enabled} onClick={pay}
                    className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                    {busy ? 'Opening Billplz…' : info.enabled ? 'Pay with Billplz' : 'Online payment not available yet'}
                  </button>
                </div>
              </div>

              {info.payments.length > 0 && (
                <div className="mt-5">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">Payments</div>
                  <div className="divide-y divide-slate-800 rounded-xl border border-slate-800">
                    {info.payments.map((p) => (
                      <div key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                        <span className="text-slate-300">{day(p.paidAt || p.createdAt)}</span>
                        <span className="text-slate-500">{p.period === 'year' ? 'Yearly' : 'Monthly'}</span>
                        <span className={'rounded px-1.5 py-0.5 text-[10px] ' + (p.status === 'paid' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/60 text-slate-300')}>
                          {p.status === 'paid' ? 'Paid' : p.status === 'pending' ? 'Awaiting payment' : p.status === 'cancelled' ? 'Cancelled' : 'Not completed'}
                        </span>
                        <span className="ml-auto tabular-nums text-slate-200">{rm(p.amountSen)}</span>
                        {p.url ? <a href={p.url} className="text-emerald-300 underline">Pay now</a> : null}
                        {p.receiptNo ? (
                          <button type="button" onClick={() => openReceipt(() => iam.billingReceipt(companyId, p.id)).catch((e) => toast(e?.message || 'Could not open the receipt', 'bad'))}
                            className="text-emerald-300 underline" title={`Receipt ${p.receiptNo}`}>Receipt {p.receiptNo}</button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
