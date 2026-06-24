import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Mail, Lock, Eye, EyeOff, ArrowRight, User } from 'lucide-react'
import { iam, type Branding } from '../lib/iam'
import { useToast } from '../components/Toast'

type Mode = 'login' | 'register' | 'forgot' | 'reset'

const COPY: Record<Mode, { title: string; sub: string; cta: string }> = {
  login: { title: 'Sign in', sub: 'Welcome back', cta: 'Sign in' },
  register: { title: 'Create your account', sub: 'Join the workspace', cta: 'Create account' },
  forgot: { title: 'Reset your password', sub: "We'll email you a secure link", cta: 'Send reset link' },
  reset: { title: 'Set a new password', sub: 'Choose a strong password', cta: 'Update password' },
}

export function Login({
  initialMode = 'login',
  resetToken,
  onAuthed,
}: {
  initialMode?: Mode
  resetToken?: string
  onAuthed: () => void
}) {
  const { toast } = useToast()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [branding, setBranding] = useState<Branding>({})
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')
  const [pi, setPi] = useState(0)

  useEffect(() => {
    iam.getBranding().then(setBranding).catch(() => {})
  }, [])

  const photos = branding.photoDataUrls || []
  useEffect(() => {
    if (photos.length <= 1) return
    const t = window.setInterval(() => setPi((i) => (i + 1) % photos.length), 5000)
    return () => window.clearInterval(t)
  }, [photos.length])

  const go = (m: Mode) => { setMode(m); setErr(''); setNotice('') }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(''); setNotice(''); setBusy(true)
    try {
      if (mode === 'login') {
        await iam.login(email.trim(), password, remember)
        onAuthed()
      } else if (mode === 'register') {
        await iam.register({ email: email.trim(), fullName: fullName.trim(), password })
        setNotice('Account created. Verify your email, then sign in.')
        setPassword(''); setMode('login')
      } else if (mode === 'forgot') {
        await iam.forgotPassword(email.trim())
        setNotice('If that email exists, a reset link is on its way.')
      } else if (mode === 'reset') {
        if (!resetToken) throw new Error('Missing reset token')
        await iam.resetPassword(resetToken, password)
        toast('Password updated — please sign in.', 'ok')
        history.replaceState(null, '', location.pathname)
        setPassword(''); setMode('login')
      }
    } catch (e: any) {
      setErr(e?.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const c = COPY[mode]
  const brandName = branding.companyName || 'Workplace'

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Hero / brand panel */}
      <div className="relative hidden w-1/2 overflow-hidden bg-emerald-700 lg:flex">
        {photos.length > 0 ? (
          <>
            {photos.map((src, i) => (
              <img
                key={i}
                src={src}
                alt=""
                className={'absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ' + (i === pi ? 'opacity-100' : 'opacity-0')}
              />
            ))}
            <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/85 via-emerald-900/45 to-emerald-900/35" />
          </>
        ) : null}
        <div className="relative z-10 flex w-full flex-col justify-between p-12 text-white">
          <div className="text-3xl font-semibold tracking-tight [text-shadow:0_1px_10px_rgba(0,0,0,0.45)]">{brandName}</div>
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-medium tracking-tight">One secure sign-on for your whole workspace.</h2>
              <p className="mt-3 max-w-sm text-sm text-emerald-50/90">
                {branding.message || 'Access every app with a single account — provisioned and governed centrally.'}
              </p>
            </div>
            <div className="text-[11px] text-emerald-50/70">© 2026 True Eco Digital Platform</div>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <form onSubmit={submit} className="w-full max-w-sm">
          {branding.logoDataUrl ? (
            <img src={branding.logoDataUrl} alt="logo" className="mx-auto mb-5 max-h-20 w-auto rounded-lg" />
          ) : null}
          <h1 className="text-lg font-medium text-slate-200">{c.title}</h1>
          <p className="mt-1 text-xs text-slate-400">{c.sub}</p>

          {notice ? (
            <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-xs text-emerald-300">{notice}</div>
          ) : null}
          {err ? (
            <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{err}</div>
          ) : null}

          <div className="mt-5 space-y-3">
            {mode === 'register' ? (
              <Field icon={<User className="h-4 w-4" />}>
                <input
                  className={inputCls}
                  placeholder="Full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </Field>
            ) : null}

            {mode !== 'reset' ? (
              <Field icon={<Mail className="h-4 w-4" />}>
                <input
                  className={inputCls}
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </Field>
            ) : null}

            {mode !== 'forgot' ? (
              <Field icon={<Lock className="h-4 w-4" />}>
                <input
                  className={inputCls}
                  type={showPw ? 'text' : 'password'}
                  placeholder={mode === 'reset' ? 'New password' : 'Password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="text-slate-500 transition-colors hover:text-slate-300"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </Field>
            ) : null}
          </div>

          {mode === 'login' ? (
            <div className="mt-3 flex items-center justify-between text-xs">
              <label className="flex cursor-pointer items-center gap-2 text-slate-400">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-emerald-500" />
                Remember me
              </label>
              <button type="button" onClick={() => go('forgot')} className="font-medium text-emerald-400 hover:text-emerald-300">
                Forgot password?
              </button>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-medium text-slate-950 transition-all duration-200 hover:bg-emerald-400 disabled:opacity-60"
          >
            {busy ? 'Please wait…' : c.cta}
            {!busy ? <ArrowRight className="h-4 w-4" /> : null}
          </button>

          <div className="mt-5 text-center text-xs text-slate-400">
            {mode === 'login' ? (
              <>
                No account?{' '}
                <button type="button" onClick={() => go('register')} className="font-medium text-emerald-400 hover:text-emerald-300">
                  Create one
                </button>
              </>
            ) : (
              <button type="button" onClick={() => go('login')} className="font-medium text-emerald-400 hover:text-emerald-300">
                ← Back to sign in
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

const inputCls = 'w-full bg-transparent text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none'

function Field({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 transition-all duration-200 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/20">
      <span className="text-slate-500">{icon}</span>
      {children}
    </div>
  )
}
