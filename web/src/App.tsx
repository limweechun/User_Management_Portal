import { useEffect, useState } from 'react'
import { iam, canUsePortal, isSuperAdmin, type Me } from './lib/iam'
import {
  resolveReturnTarget, resolveHandoffTarget, claimBounce, clearBounceGuard,
  hasReturnParam, hasHandoffParam,
} from './lib/returnTo'
import { useSession } from './context/SessionContext'
import { Login } from './screens/Login'
import { Home } from './screens/Home'

type Phase = 'booting' | 'login' | 'reset' | 'awaiting' | 'app'

// When a bounce is refused we fall through to the launcher — but the address bar still says
// ?return=<the app that keeps 401ing>. That makes the rescue landing page unstable: any reload, tab
// restore or session restore after the guard window re-arms the bounce and throws the user straight
// back into the broken app, two hops at a time, forever. So drop the trigger from the URL, exactly
// as the ?logout and ?verify paths in App() do, and the landing becomes idempotent.
function dropReturnParam(): void {
  try { history.replaceState(null, '', location.pathname) } catch { /* history unavailable */ }
}

// The SSO deep-link decision, shared by the boot path and the login-success path.
// Returns true when we have navigated away (the caller must stop); false = land on the launcher.
//
// The three outcomes are deliberately distinct. resolveReturnTarget() returns null both for "no
// deep-link at all" and for "a deep-link was present but is unusable" — and the second includes a
// TRANSIENT case: a valid, registered cross-origin target rejected only because iam.listApps() threw.
// Treating that as a plain visit was a hole in the guard: one flaky catalog fetch mid-loop called
// clearBounceGuard() (wiping the attempt count, so the next hops were allowed again) and left ?return
// in the address bar (so a reload re-fired the bounce with a zeroed counter). So we branch on whether
// a return param was PRESENT, not on whether it resolved.
async function settleReturn(): Promise<boolean> {
  const present = hasReturnParam()
  const ret = await resolveReturnTarget()
  if (ret) {
    if (claimBounce(ret)) { location.replace(ret); return true }
    dropReturnParam() // refused → make the rescue landing idempotent (see dropReturnParam)
  } else if (present) {
    dropReturnParam() // present but unusable → same idempotent landing, and the count STAYS
  } else {
    clearBounceGuard() // plain visit, no deep-link → deliberate landing, forget any past bounce
  }
  return false
}

// The ?redirect_uri token handoff (see resolveHandoffTarget), settled on the same two paths
// as settleReturn: arriving already-authed, and straight after a login. True = navigated away.
// The flicker brake is keyed on the callback WITHOUT the token — the token differs every mint,
// while a genuine loop always re-presents the identical callback.
async function settleHandoff(m: Me): Promise<boolean> {
  if (!hasHandoffParam()) return false
  const target = await resolveHandoffTarget(m, isSuperAdmin(m))
  if (target && claimBounce(target.split('#')[0])) { location.replace(target); return true }
  dropReturnParam() // unusable or brake refused → idempotent launcher landing
  return false
}

// Boot sequence mirrors the legacy app.js init(): handle ?logout / ?reset first, then resolve
// the session via GET /me. The 'app' phase is a placeholder until P1 (AdminShell) + P2 (Launcher).
export function App() {
  const { me, refresh, signOut } = useSession()
  const [phase, setPhase] = useState<Phase>('booting')
  const [resetToken, setResetToken] = useState<string | undefined>(undefined)
  const [loginNotice, setLoginNotice] = useState<string | undefined>(undefined)

  useEffect(() => {
    void (async () => {
      const params = new URLSearchParams(location.search)
      if (params.get('logout') === '1') {
        try { await iam.logout() } catch { /* best effort cookie clear */ }
        history.replaceState(null, '', location.pathname)
        setPhase('login')
        return
      }
      // Emailed verification link (?verify=<token>) from self-registration.
      const vt = params.get('verify')
      if (vt) {
        try {
          await iam.verifyEmail(vt)
          setLoginNotice('Email verified — please sign in. An administrator will grant your app access.')
        } catch {
          setLoginNotice('That verification link is invalid or already used — try signing in.')
        }
        history.replaceState(null, '', location.pathname)
        setPhase('login')
        return
      }
      const rt = params.get('reset')
      if (rt) { setResetToken(rt); setPhase('reset'); return }
      const m = await refresh()
      if (!m) { setPhase('login'); return }
      if (m.status === 'pending') { setPhase('awaiting'); return }
      // SSO deep-link: an app sent us here to sign in (?return=<deep-link> or a
      // ?redirect_uri token handoff). Already authed → bounce straight back into the app
      // instead of dead-ending on the launcher. (Legacy app.js init() at :115-116.)
      // claimBounce() breaks the flicker: if we're handed the identical target we just
      // bounced to seconds ago (the app 401s no matter what we do), we stop bouncing and
      // show the launcher, and drop the trigger param so the launcher stays put on reload.
      if (await settleHandoff(m)) return
      if (await settleReturn()) return
      setPhase('app')
    })()
  }, [refresh])

  const toApp = async () => {
    const m = await refresh()
    if (!m) { setPhase('login'); return }
    if (m.status === 'pending') { setPhase('awaiting'); return }
    // Same SSO return, on the login-success path (legacy app.js routeAuthed() at :195-196):
    // if an app handed us a ?redirect_uri or ?return, go there rather than the launcher — same
    // flicker guard, so a fresh login always gets its first bounce but an instant bounce-back
    // can't flicker.
    if (await settleHandoff(m)) return
    if (await settleReturn()) return
    setPhase('app')
  }
  const out = () => signOut().then(() => setPhase('login'))

  if (phase === 'booting') {
    return (
      <div className="grid h-screen place-items-center bg-slate-950">
        <div className="animate-pulse text-xs text-slate-500">Loading…</div>
      </div>
    )
  }
  if (phase === 'login' || phase === 'reset') {
    return <Login initialMode={phase === 'reset' ? 'reset' : 'login'} resetToken={resetToken} initialNotice={loginNotice} onAuthed={toApp} />
  }
  if (phase === 'awaiting') {
    return (
      <Centered
        title="Awaiting approval"
        body={`You're signed in as ${me?.user.fullName ?? ''}, but your account is pending an administrator's approval.`}
        onSignOut={out}
      />
    )
  }
  // phase === 'app': the post-login home — the app launcher, with the Workspace admin hub
  // reachable from it for portal/app admins.
  return <Home onSignOut={out} />
}

function Centered({ title, body, onSignOut }: { title: string; body: string; onSignOut: () => void }) {
  return (
    <div className="grid h-screen place-items-center bg-slate-950 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-sm">
        <h1 className="text-base font-medium text-slate-200">{title}</h1>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">{body}</p>
        <button
          onClick={onSignOut}
          className="mt-5 rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 transition-all duration-200 hover:bg-slate-700"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

function AuthedPlaceholder({ onSignOut }: { onSignOut: () => void }) {
  const { me } = useSession()
  const admin = canUsePortal(me)
  const initials = (me?.user.fullName || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="grid h-screen place-items-center bg-slate-950 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-full bg-emerald-500/15 text-sm font-medium text-emerald-300">{initials}</div>
          <div>
            <div className="text-sm font-medium text-slate-200">{me?.user.fullName}</div>
            <div className="text-xs text-slate-400">{me?.user.email}</div>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3">
          <Info label="Global role" value={String(me?.globalRole ?? '')} />
          <Info label="Platform role" value={String(me?.platformRole ?? '')} />
          <Info label="User ID" value={me?.user.userCode || '—'} />
          <Info label="Status" value={me?.user.status || ''} />
        </dl>
        <div className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/15 p-3 text-[11px] leading-relaxed text-emerald-300">
          Signed in — session live via the IAM cookie.{' '}
          {admin
            ? 'The 3-tier Workspace admin grid and the app launcher land in the next phases.'
            : 'The app launcher lands in the next phase.'}
        </div>
        <button
          onClick={onSignOut}
          className="mt-5 rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition-all duration-200 hover:bg-slate-800/60"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-800/40 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-200">{value}</dd>
    </div>
  )
}
