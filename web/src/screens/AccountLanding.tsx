import { useEffect, useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { usePlatformName, useLegal } from '../lib/platform'

/**
 * The SUBSCRIPTION site's front page (superlisting.net, signed out), 2026-10-13. Prices come
 * from the server's own price list (the same one every bill is worked out from), never from here.
 * Same login system as the apps: "Start free trial" is the portal's sign-up, "Sign in" its login.
 */
type PriceApp = {
  appId: string; name: string; perProperty: boolean; monthlySen: Record<string, number>; setupFeeSen: number
  extraUserMonthlySen: number | null; seats: Record<string, number> | null
}
type Prices = { trialDays: number; yearChargedMonths: number; apps: PriceApp[] }

const PLANS = [['STARTER', 'Starter'], ['PRO', 'Pro'], ['BUSINESS', 'Business']] as const
const rm = (sen: number) => 'RM' + (sen / 100).toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const BLURB: Record<string, string> = {
  psjags01: 'Projects, service jobs and goods supply — milestones, documents, invoices and collections.',
  p01: 'Purchase requests to RFQs, quotations, purchase orders, receiving and supplier payments.',
  pm01: 'Properties, units, tenants, tenancy agreements, rent invoices, receipts and letters.',
}

export function AccountLanding({ onStart, onSignIn }: { onStart: () => void; onSignIn: () => void }) {
  const platformName = usePlatformName()
  const legal = useLegal()
  const [prices, setPrices] = useState<Prices | null>(null)
  useEffect(() => {
    fetch('/api/v1/billing/prices', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then(setPrices).catch(() => setPrices(null))
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]" />
          {platformName || ' '}
        </div>
        <button onClick={onSignIn} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800">Sign in</button>
      </header>

      <section className="mx-auto max-w-3xl px-4 pb-10 pt-12 text-center">
        <h1 className="text-3xl font-semibold leading-tight text-slate-50 sm:text-4xl">Run your projects, purchasing and properties in one place</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
          Sign up your company, add your team, and start working the same day.
          {prices ? ` Free for ${prices.trialDays} days — no card needed.` : ''}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={onStart} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-medium text-slate-950 hover:bg-emerald-400">
            Start free trial <ArrowRight className="h-4 w-4" />
          </button>
          <button onClick={onSignIn} className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800">I already have an account</button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <h2 className="mb-1 text-center text-lg font-semibold text-slate-100">Plans and prices</h2>
        <p className="mb-6 text-center text-xs text-slate-500">
          Per month, in Malaysian Ringgit.{prices ? ` Pay yearly and get ${12 - prices.yearChargedMonths} months free.` : ''}
        </p>
        {!prices ? <div className="text-center text-xs text-slate-500">Loading prices…</div> : (
          <div className="space-y-6">
            {prices.apps.map((a) => (
              <div key={a.appId} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <div className="mb-4">
                  <div className="text-base font-semibold text-slate-100">{a.name}</div>
                  <div className="mt-0.5 text-xs text-slate-400">{BLURB[a.appId] || ''}</div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {PLANS.map(([p, label]) => (
                    <div key={p} className={'rounded-xl border p-4 ' + (p === 'PRO' ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-800')}>
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
                      <div className="mt-1 text-2xl font-semibold text-slate-50">{rm(a.monthlySen[p])}<span className="text-xs font-normal text-slate-400">{a.perProperty ? ' /property' : ''} /month</span></div>
                      <ul className="mt-3 space-y-1 text-xs text-slate-300">
                        {a.seats ? <li className="flex gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" />{a.seats[p]} {a.seats[p] === 1 ? 'user' : 'users'} included</li> : null}
                        {a.extraUserMonthlySen && p ? <li className="flex gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" />Extra users {rm(a.extraUserMonthlySen)} each</li> : null}
                        {a.appId === 'p01' && p === 'BUSINESS' ? <li className="flex gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" />Budgets</li> : null}
                        {p === 'BUSINESS' ? <li className="flex gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" />Priority support</li> : null}
                      </ul>
                    </div>
                  ))}
                </div>
                {a.setupFeeSen ? <div className="mt-3 text-[11px] text-slate-500">One-off setup and training: {rm(a.setupFeeSen)}</div> : null}
              </div>
            ))}
          </div>
        )}
        <div className="mt-8 text-center">
          <button onClick={onStart} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-medium text-slate-950 hover:bg-emerald-400">
            Start free trial <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
      <footer className="border-t border-slate-900 py-4 text-center text-[11px] text-slate-600">
        © {new Date().getFullYear()} {platformName}
        {legal ? (
          <>
            {' · '}<a href="/?legal=terms" className="hover:text-slate-300">Terms of Service</a>
            {' · '}<a href="/?legal=privacy" className="hover:text-slate-300">Privacy Notice</a>
          </>
        ) : null}
      </footer>
    </div>
  )
}
