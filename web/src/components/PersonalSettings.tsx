import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Drawer } from './Drawer'
import { Toggle } from './Toggle'
import { useToast } from './Toast'
import { iam } from '../lib/iam'
import { useSession } from '../context/SessionContext'

const inp =
  'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 transition-all duration-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/20'
const btn =
  'rounded-lg bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 transition-all duration-200 hover:bg-emerald-400 disabled:opacity-60'

export function PersonalSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, refresh } = useSession()
  const { toast } = useToast()
  const [fullName, setFullName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [notifyInApp, setNotifyInApp] = useState(true)
  const [notifyEmail, setNotifyEmail] = useState(true)
  const [cur, setCur] = useState('')
  const [nw, setNw] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open && me) {
      setFullName(me.user.fullName || '')
      setDisplayName(me.user.displayName || '')
      setPhone(me.user.phone || '')
      setNotifyInApp(me.user.notifyInApp ?? true)
      setNotifyEmail(me.user.notifyEmail ?? true)
      setCur('')
      setNw('')
    }
  }, [open, me])

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      // displayName always sent — an emptied field CLEARS it (apps fall back to the full name).
      await iam.updateProfile({ fullName: fullName.trim(), displayName: displayName.trim(), phone: phone.trim(), notifyInApp, notifyEmail })
      await refresh()
      toast('Profile saved', 'ok')
    } catch (err: any) {
      toast(err?.message || 'Could not save', 'bad')
    } finally {
      setBusy(false)
    }
  }

  const savePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (!cur || !nw) return
    setBusy(true)
    try {
      await iam.changePassword(cur, nw)
      toast('Password changed', 'ok')
      setCur('')
      setNw('')
    } catch (err: any) {
      toast(err?.message || 'Could not change password', 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Personal settings" width="max-w-md">
      <div className="space-y-5">
        <form onSubmit={saveProfile} className="space-y-3">
          <SectionLabel>Profile</SectionLabel>
          <Field label="Full name"><input className={inp} value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
          <Field label="Display name"><input className={inp} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Optional — the short name the apps show" /></Field>
          <Field label="Phone"><input className={inp} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">In-app notifications</span>
            <Toggle checked={notifyInApp} onChange={setNotifyInApp} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Email notifications</span>
            <Toggle checked={notifyEmail} onChange={setNotifyEmail} />
          </div>
          <button disabled={busy} className={btn}>Save profile</button>
        </form>

        <form onSubmit={savePassword} className="space-y-3 border-t border-slate-800 pt-4">
          <SectionLabel>Change password</SectionLabel>
          <Field label="Current password"><input type="password" className={inp} value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
          <Field label="New password"><input type="password" className={inp} value={nw} onChange={(e) => setNw(e.target.value)} minLength={6} /></Field>
          <button disabled={busy} className={btn}>Change password</button>
        </form>
      </div>
    </Drawer>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{children}</div>
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  )
}
