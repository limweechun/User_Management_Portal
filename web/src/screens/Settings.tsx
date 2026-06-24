import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { iam } from '../lib/iam'
import { useToast } from '../components/Toast'
import { StyledSelect } from '../components/StyledSelect'
import { Toggle } from '../components/Toggle'

// Admin Settings — 3 tabs (General · Email · ID Format). Ported from the legacy
// renderSettings (app.js 659-960): same setting keys (login_branding, general_prefs,
// idFormats) and same email-config endpoints. Logos/photos are intentionally omitted
// here (managed elsewhere) to keep this to the text-field surface.

type TabId = 'general' | 'email' | 'idformat'

// ---- small shared bits -------------------------------------------------------
const CARD = 'rounded-xl border border-slate-800 bg-slate-900 p-4'
const INPUT =
  'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-200 transition-all duration-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/20'
const LABEL = 'text-[10px] font-medium uppercase tracking-wide text-slate-400'
const BTN_PRIMARY =
  'rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 transition-all duration-200 hover:bg-emerald-400 disabled:opacity-50'
const BTN_PLAIN =
  'rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all duration-200 hover:bg-slate-800/60 disabled:opacity-50'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={LABEL}>{label}</span>
      {children}
    </label>
  )
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="flex flex-col">
        <span className="text-xs font-medium text-slate-200">{label}</span>
        {hint ? <span className="text-[11px] text-slate-400">{hint}</span> : null}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

// ---- General tab -------------------------------------------------------------
const DATE_FORMATS = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD MMM YYYY']

function GeneralTab() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  // branding
  const [companyName, setCompanyName] = useState('')
  const [message, setMessage] = useState('')
  const [logoDataUrl, setLogoDataUrl] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  // prefs
  const [timezone, setTimezone] = useState('UTC')
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD')
  const [currency, setCurrency] = useState('USD ($)')
  const [language, setLanguage] = useState('English')
  const [savingBrand, setSavingBrand] = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const s = await iam.loadSettings()
        if (!alive) return
        const b = (s.login_branding || {}) as Record<string, any>
        const g = (s.general_prefs || {}) as Record<string, any>
        setCompanyName(b.companyName || '')
        setMessage(b.message || '')
        setLogoDataUrl(b.logoDataUrl || '')
        setPhotos(Array.isArray(b.photoDataUrls) ? b.photoDataUrls : [])
        setTimezone(g.timezone || 'UTC')
        setDateFormat(g.dateFormat || 'YYYY-MM-DD')
        setCurrency(g.currency || 'USD ($)')
        setLanguage(g.language || 'English')
      } catch {
        /* leave defaults */
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const saveBranding = async () => {
    setSavingBrand(true)
    try {
      await iam.saveSetting('login_branding', {
        companyName: companyName.trim(),
        message: message.trim(),
        logoDataUrl,
        photoDataUrls: photos,
      })
      toast('Saved', 'ok')
    } catch (e: any) {
      toast(e?.message || 'Save failed', 'bad')
    } finally {
      setSavingBrand(false)
    }
  }

  const savePrefs = async () => {
    setSavingPrefs(true)
    try {
      await iam.saveSetting('general_prefs', { timezone, dateFormat, currency, language })
      toast('Saved', 'ok')
    } catch (e: any) {
      toast(e?.message || 'Save failed', 'bad')
    } finally {
      setSavingPrefs(false)
    }
  }

  const readImage = (file: File, cb: (dataUrl: string) => void) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) { toast('Use a PNG, JPG, WEBP or GIF image', 'bad'); return }
    if (file.size > 1_000_000) { toast('Each image must be under ~1 MB', 'bad'); return }
    const r = new FileReader()
    r.onload = () => cb(String(r.result))
    r.onerror = () => toast('Could not read that image', 'bad')
    r.readAsDataURL(file)
  }
  const onLogoFile = (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) readImage(f, setLogoDataUrl) }
  const onPhotoFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []); e.target.value = ''
    files.forEach((f) => readImage(f, (d) => setPhotos((p) => (p.length >= 8 ? p : [...p, d]))))
  }

  if (loading) return <p className="text-xs text-slate-400">Loading…</p>

  return (
    <div className="flex flex-col gap-4">
      <section className={CARD}>
        <h3 className="mb-3 text-xs font-semibold text-slate-200">Login page branding</h3>
        <div className="grid grid-cols-1 gap-3">
          <Field label="Login page company name">
            <input
              className={INPUT}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. True Eco Group"
            />
          </Field>
          <Field label="Login page message">
            <input
              className={INPUT}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Welcome back! Please sign in to continue."
            />
          </Field>
        </div>
        <div className="mt-3">
          <span className={LABEL}>Login logo</span>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-700 bg-slate-800/40">
              {logoDataUrl ? <img src={logoDataUrl} alt="Login logo" className="h-full w-full object-contain" /> : <span className="text-[9px] text-slate-600">No logo</span>}
            </div>
            <label className={BTN_PLAIN + ' cursor-pointer'}>
              {logoDataUrl ? 'Replace' : 'Upload'}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onLogoFile} className="hidden" />
            </label>
            {logoDataUrl ? (
              <button type="button" onClick={() => setLogoDataUrl('')} className="text-[11px] text-rose-400 transition-colors hover:text-rose-300">Remove</button>
            ) : null}
          </div>
        </div>

        <div className="mt-3">
          <span className={LABEL}>Login page photos</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {photos.map((src, i) => (
              <div key={i} className="group relative h-16 w-24 overflow-hidden rounded-lg border border-slate-700">
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                  className="absolute right-1 top-1 rounded bg-slate-900/80 p-0.5 text-rose-300 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Remove photo"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            {photos.length < 8 ? (
              <label className="grid h-16 w-24 cursor-pointer place-items-center rounded-lg border border-dashed border-slate-700 text-[11px] text-slate-500 transition-colors hover:border-emerald-500 hover:text-emerald-300">
                + Add
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={onPhotoFiles} className="hidden" />
              </label>
            ) : null}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">Shown on the login page hero (rotating if multiple). PNG/JPG/WEBP/GIF, under ~1 MB each, up to 8.</p>
        </div>

        <div className="mt-3">
          <button className={BTN_PRIMARY} onClick={saveBranding} disabled={savingBrand}>
            {savingBrand ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>

      <section className={CARD}>
        <h3 className="mb-3 text-xs font-semibold text-slate-200">Platform preferences</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Timezone">
            <input
              className={INPUT}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="e.g. Asia/Kuala_Lumpur"
            />
          </Field>
          <Field label="Date format">
            <StyledSelect tone="dark" value={dateFormat} onChange={setDateFormat}>
              {DATE_FORMATS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </StyledSelect>
          </Field>
          <Field label="Currency">
            <input
              className={INPUT}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              placeholder="e.g. MYR (RM)"
            />
          </Field>
          <Field label="Language">
            <input
              className={INPUT}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="e.g. English"
            />
          </Field>
        </div>
        <div className="mt-3">
          <button className={BTN_PRIMARY} onClick={savePrefs} disabled={savingPrefs}>
            {savingPrefs ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>
    </div>
  )
}

// ---- Email tab ---------------------------------------------------------------
interface EmailCfg {
  enabled: boolean
  host: string
  port: number
  secure: boolean
  user: string
  password: string
  fromName: string
  fromEmail: string
  hasPassword?: boolean
}

const EMPTY_EMAIL: EmailCfg = {
  enabled: false,
  host: '',
  port: 587,
  secure: false,
  user: '',
  password: '',
  fromName: '',
  fromEmail: '',
  hasPassword: false,
}

function EmailTab() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [cfg, setCfg] = useState<EmailCfg>(EMPTY_EMAIL)
  const [saving, setSaving] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [testBusy, setTestBusy] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [checkBusy, setCheckBusy] = useState(false)
  const [checkResult, setCheckResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const ec = await iam.getEmailConfig()
        if (!alive) return
        setCfg({
          enabled: !!ec.enabled,
          host: ec.host || '',
          port: Number(ec.port) || 587,
          secure: !!ec.secure,
          user: ec.user || '',
          password: '',
          fromName: ec.fromName || '',
          fromEmail: ec.fromEmail || '',
          hasPassword: !!ec.hasPassword,
        })
      } catch {
        /* leave empty */
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const patch = (p: Partial<EmailCfg>) => setCfg((c) => ({ ...c, ...p }))

  const save = async () => {
    setSaving(true)
    try {
      await iam.saveEmailConfig({
        enabled: cfg.enabled,
        host: cfg.host.trim(),
        port: cfg.port,
        secure: cfg.secure,
        user: cfg.user.trim(),
        password: cfg.password,
        fromName: cfg.fromName.trim(),
        fromEmail: cfg.fromEmail.trim(),
      })
      toast('Saved', 'ok')
    } catch (e: any) {
      toast(e?.message || 'Save failed', 'bad')
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async () => {
    if (!testTo.trim()) return
    setTestBusy(true)
    setTestResult(null)
    try {
      await iam.testEmail(testTo.trim())
      setTestResult({ ok: true, text: 'Test email sent.' })
    } catch (e: any) {
      setTestResult({ ok: false, text: e?.message || 'Failed to send test email.' })
    } finally {
      setTestBusy(false)
    }
  }

  const checkConnection = async () => {
    setCheckBusy(true)
    setCheckResult(null)
    try {
      const d: any = await iam.verifyEmailConfig()
      const ok = !!(d && d.verify && d.verify.ok)
      setCheckResult({
        ok,
        text: ok
          ? 'Connection + login to the mail server succeeded.'
          : 'Connection / login failed: ' +
            ((d && d.verify && d.verify.error) || (d && !d.saved ? 'no SMTP host saved' : 'unknown error')),
      })
    } catch (e: any) {
      setCheckResult({ ok: false, text: e?.message || 'Could not run the check.' })
    } finally {
      setCheckBusy(false)
    }
  }

  if (loading) return <p className="text-xs text-slate-400">Loading…</p>

  return (
    <div className="flex flex-col gap-4">
      <section className={CARD}>
        <h3 className="mb-3 text-xs font-semibold text-slate-200">SMTP configuration</h3>

        <SwitchRow
          label="Enable email sending"
          hint="When off, no real emails go out."
          checked={cfg.enabled}
          onChange={(v) => patch({ enabled: v })}
        />

        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="SMTP host">
            <input
              className={INPUT}
              value={cfg.host}
              onChange={(e) => patch({ host: e.target.value })}
              placeholder="e.g. smtp.gmail.com"
            />
          </Field>
          <Field label="Port">
            <input
              className={INPUT}
              type="number"
              value={cfg.port}
              onChange={(e) => patch({ port: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Username">
            <input
              className={INPUT}
              value={cfg.user}
              autoComplete="off"
              onChange={(e) => patch({ user: e.target.value })}
              placeholder="SMTP username"
            />
          </Field>
          <Field label="Password">
            <input
              className={INPUT}
              type="password"
              value={cfg.password}
              autoComplete="new-password"
              onChange={(e) => patch({ password: e.target.value })}
              placeholder={cfg.hasPassword ? '•••••• (leave blank to keep)' : 'SMTP password'}
            />
          </Field>
          <Field label="From name">
            <input
              className={INPUT}
              value={cfg.fromName}
              onChange={(e) => patch({ fromName: e.target.value })}
              placeholder="e.g. Workplace Operations"
            />
          </Field>
          <Field label="From email">
            <input
              className={INPUT}
              value={cfg.fromEmail}
              onChange={(e) => patch({ fromEmail: e.target.value })}
              placeholder="e.g. noreply@company.com"
            />
          </Field>
        </div>

        <div className="mt-3">
          <SwitchRow
            label="SSL/TLS (port 465)"
            checked={cfg.secure}
            onChange={(v) => patch({ secure: v })}
          />
        </div>

        <div className="mt-3">
          <button className={BTN_PRIMARY} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>

      <section className={CARD}>
        <h3 className="mb-3 text-xs font-semibold text-slate-200">Diagnostics</h3>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className={INPUT + ' max-w-[220px]'}
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="send test to…"
            />
            <button
              className={BTN_PLAIN}
              onClick={sendTest}
              disabled={testBusy || !testTo.trim()}
            >
              {testBusy ? 'Sending…' : 'Send test'}
            </button>
            {testResult ? (
              <span
                className={
                  'text-[11px] font-medium ' +
                  (testResult.ok ? 'text-emerald-400' : 'text-rose-400')
                }
              >
                {testResult.ok ? '✓ ' : '✗ '}
                {testResult.text}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className={BTN_PLAIN} onClick={checkConnection} disabled={checkBusy}>
              {checkBusy ? 'Checking…' : 'Check connection'}
            </button>
            {checkResult ? (
              <span
                className={
                  'text-[11px] font-medium ' +
                  (checkResult.ok ? 'text-emerald-400' : 'text-rose-400')
                }
              >
                {checkResult.ok ? '✓ ' : '✗ '}
                {checkResult.text}
              </span>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}

// ---- ID Format tab -----------------------------------------------------------
interface IdFmt {
  prefix: string
  separator: string
  includeYear: boolean
  includeMonth: boolean
  seqDigits: number
}

const SEP_OPTS: [string, string][] = [
  ['-', '- (dash)'],
  ['_', '_ (underscore)'],
  ['/', '/ (slash)'],
  ['', '(none)'],
]

function idfPreview(f: IdFmt): string {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(-2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const sep = f.separator || ''
  const parts = [f.prefix || 'UR']
  if (f.includeYear) parts.push(yy)
  if (f.includeMonth) parts.push(mm)
  return parts.join(sep) + sep + String(1).padStart(f.seqDigits || 4, '0')
}

function IdFormatTab() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [others, setOthers] = useState<any[]>([])
  const [fmt, setFmt] = useState<IdFmt>({
    prefix: 'UR',
    separator: '-',
    includeYear: false,
    includeMonth: false,
    seqDigits: 4,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const s = await iam.loadSettings()
        if (!alive) return
        const list: any[] = Array.isArray(s.idFormats) ? s.idFormats : []
        const mine = list.find((e) => e && e.entityKey === 'user')
        setOthers(list.filter((e) => e && e.entityKey !== 'user'))
        if (mine) {
          setFmt({
            prefix: mine.prefix || 'UR',
            separator: mine.separator ?? '-',
            includeYear: !!mine.includeYear,
            includeMonth: !!mine.includeMonth,
            seqDigits: Number(mine.seqDigits) || 4,
          })
        }
      } catch {
        /* leave defaults */
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const patch = (p: Partial<IdFmt>) => setFmt((f) => ({ ...f, ...p }))

  const save = async () => {
    setSaving(true)
    try {
      const entry = {
        entityKey: 'user',
        entityLabel: 'User',
        prefix: (fmt.prefix.trim().toUpperCase() || 'UR').slice(0, 8),
        separator: fmt.separator,
        includeYear: fmt.includeYear,
        includeMonth: fmt.includeMonth,
        seqDigits: fmt.seqDigits,
      }
      await iam.saveSetting('idFormats', [entry, ...others])
      toast('Saved', 'ok')
    } catch (e: any) {
      toast(e?.message || 'Save failed', 'bad')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-xs text-slate-400">Loading…</p>

  return (
    <div className="flex flex-col gap-4">
      <section className={CARD}>
        <p className="mb-3 text-[11px] text-slate-400">
          The global format for new human-readable User IDs across the whole platform.
          Changing it affects new users only.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Prefix">
            <input
              className={INPUT}
              maxLength={8}
              value={fmt.prefix}
              onChange={(e) => patch({ prefix: e.target.value })}
              placeholder="UR"
            />
          </Field>
          <Field label="Separator">
            <StyledSelect tone="dark" value={fmt.separator} onChange={(v) => patch({ separator: v })}>
              {SEP_OPTS.map(([v, l]) => (
                <option key={l} value={v}>
                  {l}
                </option>
              ))}
            </StyledSelect>
          </Field>
          <Field label="Number of digits">
            <StyledSelect
              tone="dark"
              value={String(fmt.seqDigits)}
              onChange={(v) => patch({ seqDigits: Number(v) || 4 })}
            >
              {[2, 3, 4, 5].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </StyledSelect>
          </Field>
        </div>

        <div className="mt-3 flex flex-col gap-1">
          <SwitchRow
            label="Include year (YY)"
            checked={fmt.includeYear}
            onChange={(v) => patch({ includeYear: v })}
          />
          <SwitchRow
            label="Include month (MM)"
            checked={fmt.includeMonth}
            onChange={(v) => patch({ includeMonth: v })}
          />
        </div>

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-800/40 px-3 py-2">
          <span className={LABEL}>Next User ID preview</span>
          <div className="mt-1 font-mono text-sm font-semibold text-slate-200">
            {idfPreview(fmt)}
          </div>
        </div>

        <div className="mt-3">
          <button className={BTN_PRIMARY} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>
    </div>
  )
}

// ---- shell -------------------------------------------------------------------
const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'email', label: 'Email' },
  { id: 'idformat', label: 'ID Format' },
]

export function Settings() {
  const [tab, setTab] = useState<TabId>('general')

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-4 border-b border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              'pb-2 text-xs font-medium transition-all duration-200 ' +
              (tab === t.id
                ? 'border-b-2 border-emerald-500 text-emerald-300'
                : 'text-slate-400 hover:text-slate-200')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' ? <GeneralTab /> : null}
      {tab === 'email' ? <EmailTab /> : null}
      {tab === 'idformat' ? <IdFormatTab /> : null}
    </div>
  )
}
