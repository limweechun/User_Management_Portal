import { useState, type FormEvent } from 'react'
import { iam } from '../lib/iam'

/**
 * A temporary password must be replaced before anything else (owner 2026-10-24): an administrator
 * who sets one for a user (My team) sends them here at their next sign-in.
 */
export function ChangePasswordFirst({ name, onDone, onSignOut }: { name: string; onDone: () => void; onSignOut: () => void }) {
  const [cur, setCur] = useState('')
  const [nw, setNw] = useState('')
  const [again, setAgain] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    if (nw.length < 6) { setErr('The new password needs at least 6 characters.'); return }
    if (nw !== again) { setErr('The two new passwords do not match.'); return }
    if (nw === cur) { setErr('Choose a password different from the temporary one.'); return }
    setBusy(true)
    try { await iam.changePassword(cur, nw); onDone() }
    catch (e: any) { setErr(e?.message || 'Could not change the password') }
    finally { setBusy(false) }
  }

  const inp = 'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none'
  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-7 shadow-sm">
        <h1 className="text-base font-medium text-slate-100">Set your own password</h1>
        <p className="text-xs leading-relaxed text-slate-400">
          Welcome{name ? `, ${name}` : ''}. You signed in with a temporary password from your administrator. Choose your own password to continue.
        </p>
        <input className={inp} type="password" placeholder="Temporary password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required />
        <input className={inp} type="password" placeholder="New password (at least 6 characters)" value={nw} onChange={(e) => setNw(e.target.value)} autoComplete="new-password" required />
        <input className={inp} type="password" placeholder="New password again" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required />
        {err ? <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{err}</div> : null}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60">
          {busy ? 'Saving…' : 'Save and continue'}
        </button>
        <button type="button" onClick={onSignOut} className="w-full text-center text-[11px] text-slate-500 hover:text-slate-300">Sign out</button>
      </form>
    </div>
  )
}
