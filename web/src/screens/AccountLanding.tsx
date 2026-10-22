import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, Check, X, ShieldCheck, Users, Building2, Receipt } from 'lucide-react'
import { usePlatformName, useLegal } from '../lib/platform'

/**
 * The SUBSCRIPTION site's front page (superlisting.net, signed out). One page (owner ask 2026-10-22):
 * what the platform is, the apps, how it works, prices, contact. "Sign in" asks for the customer's
 * GROUP and goes to its own sign-in page (superlisting.net/<group code>); the last group used is
 * remembered on this device so the next visit goes straight there. Prices come from the server's
 * own price list (the one every bill is worked out from), never from here.
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
const FEATURES: Record<string, string[]> = {
  psjags01: ['Milestone timeline and S-curve', 'Service reports, delivery orders and minutes', 'Invoices, collections and debtors'],
  p01: ['Request → RFQ → quotation → PO in one path', 'Approvals with a full audit trail', 'Receiving and supplier payments'],
  pm01: ['Units, tenants and tenancy agreements', 'Rent invoices and official receipts', 'Letters printed on your letterhead'],
}
const GROUP_KEY = 'sl.group'
const codeOf = (s: string) => s.replace(/[^A-Za-z0-9]/g, '').toLowerCase()
const remembered = () => { try { return localStorage.getItem(GROUP_KEY) || '' } catch { return '' } }
export const rememberGroup = (code: string) => { try { localStorage.setItem(GROUP_KEY, code) } catch { /* private window */ } }

function SignInBox({ onClose, onStart }: { onClose: () => void; onStart: () => void }) {
  const last = remembered()
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async (code: string) => {
    if (code.length < 3) { setErr('Type your group name.'); return }
    setBusy(true); setErr('')
    try {
      const r = await fetch(`/api/v1/groups/${encodeURIComponent(code)}`, { credentials: 'same-origin' })
      if (!r.ok) { setErr('No group with that name. Check the spelling, or ask your administrator for your sign-in link.'); setBusy(false); return }
      rememberGroup(code)
      window.location.href = '/' + code
    } catch { setErr('Could not reach the server. Try again.'); setBusy(false) }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void go(codeOf(name)) }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={submit} className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 text-slate-500 hover:text-slate-300"><X className="h-4 w-4" /></button>
        <h2 className="text-base font-semibold text-slate-100">Sign in to your group</h2>
        <p className="mt-1 text-xs text-slate-400">Type your group's name, the one your company signed up with.</p>
        {last ? (
          <button type="button" onClick={() => go(last)} disabled={busy}
            className="mt-4 flex w-full items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-left text-xs text-emerald-200 hover:bg-emerald-500/15">
            <span>Continue to <b>{last}</b></span><ArrowRight className="h-4 w-4" />
          </button>
        ) : null}
        <input autoFocus={!last} value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name, e.g. ABC Group" maxLength={80}
          className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
        {codeOf(name).length >= 3 ? <p className="mt-1.5 text-[11px] text-slate-500">{location.host}/<span className="text-emerald-300">{codeOf(name)}</span></p> : null}
        {err ? <p className="mt-2 text-xs text-rose-300">{err}</p> : null}
        <button type="submit" disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60">
          {busy ? 'Finding your group…' : 'Continue'} {!busy ? <ArrowRight className="h-4 w-4" /> : null}
        </button>
        <p className="mt-4 text-center text-[11px] text-slate-500">
          New here? <button type="button" onClick={onStart} className="font-medium text-emerald-400 hover:text-emerald-300">Start a free trial</button>
        </p>
      </form>
    </div>
  )
}

export function AccountLanding({ onStart }: { onStart: () => void; onSignIn?: () => void }) {
  const platformName = usePlatformName()
  const legal = useLegal()
  const [prices, setPrices] = useState<Prices | null>(null)
  const [signIn, setSignIn] = useState(false)
  useEffect(() => {
    fetch('/api/v1/billing/prices', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then(setPrices).catch(() => setPrices(null))
  }, [])
  const apps = prices?.apps || []

  const navLink = 'text-xs text-slate-400 hover:text-slate-100'
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="sticky top-0 z-40 border-b border-slate-900 bg-slate-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <a href="#top" className="flex items-center gap-2 text-sm font-semibold">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]" />
            {platformName || ' '}
          </a>
          <nav className="hidden items-center gap-5 sm:flex">
            <a href="#apps" className={navLink}>Apps</a>
            <a href="#how" className={navLink}>How it works</a>
            <a href="#pricing" className={navLink}>Pricing</a>
            <a href="#contact" className={navLink}>Contact</a>
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={() => setSignIn(true)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800">Sign in</button>
            <button onClick={onStart} className="hidden rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-emerald-400 sm:inline-block">Start free trial</button>
          </div>
        </div>
      </header>

      <section id="top" className="mx-auto max-w-3xl px-4 pb-14 pt-16 text-center">
        <h1 className="text-3xl font-semibold leading-tight text-slate-50 sm:text-4xl">Run your projects, purchasing and properties in one place</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
          Business apps built for Malaysian companies. Set up your group, add your team, and start working the same day.
          {prices ? ` Free for ${prices.trialDays} days, no card needed.` : ''}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button onClick={onStart} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-medium text-slate-950 hover:bg-emerald-400">
            Start free trial <ArrowRight className="h-4 w-4" />
          </button>
          <button onClick={() => setSignIn(true)} className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800">Sign in to your group</button>
        </div>
      </section>

      <section id="apps" className="mx-auto max-w-6xl scroll-mt-16 px-4 pb-16">
        <h2 className="mb-6 text-center text-lg font-semibold text-slate-100">The apps</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {(apps.length ? apps.map((a) => [a.appId, a.name] as const) : [['psjags01', 'Project & Service Management'], ['p01', 'Procurement'], ['pm01', 'Property Management']] as const).map(([id, name]) => (
            <div key={id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="text-base font-semibold text-slate-100">{name}</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{BLURB[id] || ''}</p>
              <ul className="mt-3 space-y-1.5 text-xs text-slate-300">
                {(FEATURES[id] || []).map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />{f}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="border-y border-slate-900 bg-slate-900/40">
        <div className="mx-auto max-w-6xl scroll-mt-16 px-4 py-14">
          <h2 className="mb-8 text-center text-lg font-semibold text-slate-100">How it works</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              [Building2, 'Set up your group', 'Sign up with your group and company name. Your team gets its own sign-in page, with your logo and photos.'],
              [Users, 'Add your team', 'Invite your people and choose which apps each one uses. Add more companies to the group any time.'],
              [Receipt, 'Subscribe when ready', 'Pay monthly or yearly online. Every payment comes with an official receipt by email.'],
            ].map(([Icon, title, text], i) => {
              const I = Icon as typeof Users
              return (
                <div key={i} className="text-center">
                  <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-emerald-500/15 text-emerald-300"><I className="h-5 w-5" /></div>
                  <div className="text-sm font-semibold text-slate-100">{i + 1}. {title as string}</div>
                  <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-slate-400">{text as string}</p>
                </div>
              )
            })}
          </div>
          <div className="mx-auto mt-10 flex max-w-2xl items-start gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <p>Your data is yours. Each group is walled off from every other, our support staff can only enter your account for a stated reason and for two hours at a time, and you can see every visit.</p>
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16">
        <h2 className="mb-1 text-center text-lg font-semibold text-slate-100">Plans and prices</h2>
        <p className="mb-6 text-center text-xs text-slate-500">
          Per month, in Malaysian Ringgit.{prices ? ` Pay yearly and get ${12 - prices.yearChargedMonths} months free.` : ''}
        </p>
        {!prices ? <div className="text-center text-xs text-slate-500">Loading prices…</div> : (
          <div className="space-y-6">
            {prices.apps.map((a) => (
              <div key={a.appId} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <div className="mb-4 text-base font-semibold text-slate-100">{a.name}</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {PLANS.map(([p, label]) => (
                    <div key={p} className={'rounded-xl border p-4 ' + (p === 'PRO' ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-800')}>
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
                      <div className="mt-1 text-2xl font-semibold text-slate-50">{rm(a.monthlySen[p])}<span className="text-xs font-normal text-slate-400">{a.perProperty ? ' /property' : ''} /month</span></div>
                      <ul className="mt-3 space-y-1 text-xs text-slate-300">
                        {a.seats ? <li className="flex gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" />{a.seats[p]} {a.seats[p] === 1 ? 'user' : 'users'} included</li> : null}
                        {a.extraUserMonthlySen ? <li className="flex gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" />Extra users {rm(a.extraUserMonthlySen)} each</li> : null}
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

      <section id="contact" className="border-t border-slate-900 bg-slate-900/40">
        <div className="mx-auto max-w-3xl scroll-mt-16 px-4 py-14 text-center">
          <h2 className="text-lg font-semibold text-slate-100">Talk to us</h2>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-slate-400">
            Questions about the apps, a demo, or help moving your data across? Email us and we will get back to you within one working day.
          </p>
          <a href="mailto:accounts@fostercircle.com" className="mt-4 inline-block rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-emerald-300 hover:bg-slate-800">accounts@fostercircle.com</a>
          <p className="mt-6 text-[11px] text-slate-500">{platformName} is provided by Foster Circle Sdn Bhd (202001000522), Seri Kembangan, Selangor, Malaysia.</p>
        </div>
      </section>

      <footer className="border-t border-slate-900 py-4 text-center text-[11px] text-slate-600">
        © {new Date().getFullYear()} {platformName}
        {legal ? (
          <>
            {' · '}<a href="?legal=terms" className="hover:text-slate-300">Terms of Service</a>
            {' · '}<a href="?legal=privacy" className="hover:text-slate-300">Privacy Notice</a>
          </>
        ) : null}
      </footer>

      {signIn ? <SignInBox onClose={() => setSignIn(false)} onStart={() => { setSignIn(false); onStart() }} /> : null}
    </div>
  )
}
