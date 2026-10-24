import { useEffect, useState, type FormEvent } from 'react'
import { X, UserPlus, Trash2, KeyRound, Ban, RotateCcw } from 'lucide-react'
import { iam, type TeamView, type TeamMember } from '../lib/iam'
import { useToast } from './Toast'
import { SupportVisits } from './SupportAccess'

/**
 * "My team" (SaaS stage 4, 2026-10-13): a customer's administrator adds, changes and removes
 * the users of their own company, within the plan's user limit. The server enforces every rule
 * (own company only, no admin roles, the limit); this screen just shows them.
 */
export function MyTeam({ companyId, onClose, inline = false }: { companyId: string; onClose: () => void; /** customer portal tab instead of a pop-up */ inline?: boolean }) {
  const { toast } = useToast()
  const [view, setView] = useState<TeamView | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [resetting, setResetting] = useState<TeamMember | null>(null)
  // A set-password link the server could not email (no mail set up): shown once to pass on.
  const [link, setLink] = useState<{ who: string; url: string } | null>(null)

  const load = () => iam.team(companyId).then(setView).catch((e) => { toast(e?.message || 'Could not load your team', 'bad'); onClose() })
  useEffect(() => { load() }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (m: TeamMember) => {
    if (!confirm(`Remove ${m.fullName} from ${view?.company.name}? Their account stays; they lose access to this company.`)) return
    try { await iam.teamRemove(companyId, m.id); toast('User removed', 'ok'); load() }
    catch (e: any) { toast(e?.message || 'Could not remove', 'bad') }
  }

  const setActive = async (m: TeamMember, active: boolean) => {
    if (!active && !confirm(`Deactivate ${m.fullName}? They can no longer sign in until you reactivate them.`)) return
    try { await iam.teamStatus(companyId, m.id, active); toast(active ? 'User reactivated' : 'User deactivated', 'ok'); load() }
    catch (e: any) { toast(e?.message || 'Could not change', 'bad') }
  }

  const appName = (id: string) => view?.apps.find((a) => a.appId === id)?.name || id
  const roleLabel = (appId: string, role: string) => view?.apps.find((a) => a.appId === appId)?.roles.find((r) => r.name === role)?.label || role

  return (
    <div className={inline ? "" : "fixed inset-0 z-50 flex items-center justify-center p-4"}>
      {!inline && <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" onClick={onClose} />}
      <div className={inline ? "flex w-full flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900" : "relative z-10 flex max-h-[90vh] w-full max-w-[784px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"}>
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="truncate text-sm font-medium text-slate-100">My team{view ? ' · ' + view.company.name : ''}</div>
          {!inline && <button onClick={onClose} className="text-slate-400 hover:text-slate-200" aria-label="Close"><X className="h-4 w-4" /></button>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!view ? <div className="text-xs text-slate-500">Loading…</div> : (
            <>
              <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {view.apps.map((a) => (
                  <div key={a.appId} className="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
                    <div className="text-xs font-medium text-slate-200">{a.name}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">{a.planLabel ? `${a.planLabel} plan` : 'No plan'}</div>
                    <div className={'mt-1 text-xs ' + (a.seats != null && a.used >= a.seats ? 'text-amber-300' : 'text-emerald-300')}>
                      {a.seats != null ? `${a.used} of ${a.seats} users` : `${a.used} users`}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Users</div>
                <button onClick={() => { setEditing(null); setAdding(true) }} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-emerald-400">
                  <UserPlus className="h-3.5 w-3.5" /> Add user
                </button>
              </div>
              <div className="divide-y divide-slate-800 rounded-xl border border-slate-800">
                {view.members.map((m) => {
                  const admin = m.apps.some((a) => a.isAppAdmin)
                  return (
                    <div key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-slate-200">{m.displayName || m.fullName}{admin ? <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">Administrator</span> : null}
                          {m.status === 'inactive' ? <span className="ml-2 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-300">Deactivated</span> : null}
                          {m.status !== 'inactive' && m.emailVerified === false ? <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">Invited</span> : null}
                          {m.status !== 'inactive' && m.mustChangePassword ? <span className="ml-2 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">Temporary password</span> : null}</div>
                        <div className="truncate text-[11px] text-slate-500">{m.email}{m.userCode ? ' · ' + m.userCode : ''}</div>
                      </div>
                      <div className="text-[11px] text-slate-400">{m.apps.map((a) => `${appName(a.appId)}: ${a.isAppAdmin ? 'Administrator' : roleLabel(a.appId, a.role)}`).join(' · ')}</div>
                      {!admin && m.id !== view.me ? (
                        <div className="flex gap-1">
                          <button onClick={() => { setAdding(false); setResetting(null); setEditing(m) }} className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800/60">Change</button>
                          <button onClick={() => { setAdding(false); setEditing(null); setResetting(m) }} title="Reset password" aria-label={`Reset password for ${m.fullName}`} className="rounded-lg border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800/60"><KeyRound className="h-3 w-3" /></button>
                          {m.status === 'inactive'
                            ? <button onClick={() => setActive(m, true)} title="Reactivate" aria-label={`Reactivate ${m.fullName}`} className="rounded-lg border border-emerald-500/40 px-2 py-1 text-emerald-300 hover:bg-emerald-500/10"><RotateCcw className="h-3 w-3" /></button>
                            : <button onClick={() => setActive(m, false)} title="Deactivate" aria-label={`Deactivate ${m.fullName}`} className="rounded-lg border border-amber-500/40 px-2 py-1 text-amber-300 hover:bg-amber-500/10"><Ban className="h-3 w-3" /></button>}
                          <button onClick={() => remove(m)} className="rounded-lg border border-rose-500/40 px-2 py-1 text-rose-300 hover:bg-rose-500/10" aria-label={`Remove ${m.fullName}`}><Trash2 className="h-3 w-3" /></button>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
              {!inline && <SupportVisits companyId={companyId} />}
              {(adding || editing) && (
                <MemberForm view={view} member={editing} companyId={companyId}
                  onLink={(who, url) => setLink({ who, url })}
                  onDone={() => { setAdding(false); setEditing(null); load() }} onCancel={() => { setAdding(false); setEditing(null) }} />
              )}
              {resetting && (
                <ResetForm member={resetting} companyId={companyId} onLink={(who, url) => setLink({ who, url })}
                  onDone={() => { setResetting(null); load() }} onCancel={() => setResetting(null)} />
              )}
              {link && (
                <div className="mt-4 space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                  <div>Email is not set up, so the link was not sent. Pass this link to {link.who} yourself (WhatsApp, etc.). It works once.</div>
                  <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-200" />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => { void navigator.clipboard?.writeText(link.url); toast('Link copied', 'ok') }} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-emerald-400">Copy link</button>
                    <button type="button" onClick={() => setLink(null)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60">Done</button>
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

function MemberForm({ view, member, companyId, onDone, onCancel, onLink }: {
  view: TeamView; member: TeamMember | null; companyId: string; onDone: () => void; onCancel: () => void; onLink: (who: string, url: string) => void
}) {
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  // How a NEW user gets in (owner 2026-10-24): an emailed invitation, or a temporary password.
  const [mode, setMode] = useState<'invite' | 'password'>('invite')
  const [roles, setRoles] = useState<Record<string, string>>(() =>
    Object.fromEntries((member?.apps || []).map((a) => [a.appId, a.role])))
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const grants = Object.entries(roles).filter(([, r]) => r).map(([appId, role]) => ({ appId, role }))
    if (!member && !grants.length) { toast('Choose at least one app', 'bad'); return }
    setBusy(true)
    try {
      if (member) { await iam.teamUpdate(companyId, member.id, grants); toast('Access updated', 'ok') }
      else {
        const r = await iam.teamAdd(companyId, { email: email.trim(), fullName: fullName.trim(), mode, password: mode === 'password' ? password : undefined, grants })
        if (r.invited && !r.emailed && r.link) onLink(fullName.trim(), r.link)
        toast(r.invited ? (r.emailed ? 'Invitation emailed' : 'User added') : 'User added', 'ok')
      }
      onDone()
    } catch (err: any) {
      toast(err?.message || 'Could not save', 'bad')
    } finally { setBusy(false) }
  }

  const inp = 'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none'
  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl border border-slate-700 bg-slate-800/40 p-3">
      <div className="text-xs font-medium text-slate-200">{member ? `Change access · ${member.fullName}` : 'Add a user'}</div>
      {!member && (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input className={inp} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input className={inp} style={{ textTransform: 'uppercase' }} placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value.toUpperCase())} required />
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-slate-300">
            <label className="flex items-center gap-1.5"><input type="radio" checked={mode === 'invite'} onChange={() => setMode('invite')} /> Email an invitation (they set their own password)</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={mode === 'password'} onChange={() => setMode('password')} /> Give a temporary password</label>
          </div>
          {mode === 'password' && (
            <input className={inp + ' sm:max-w-xs'} type="text" placeholder="Temporary password (at least 6)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" required minLength={6} />
          )}
        </>
      )}
      <div className="space-y-2">
        {view.apps.map((a) => (
          <label key={a.appId} className="flex items-center gap-2 text-xs">
            <span className="w-40 truncate text-slate-300">{a.name}</span>
            <select className={inp + ' max-w-xs'} value={roles[a.appId] || ''} onChange={(e) => setRoles((r) => ({ ...r, [a.appId]: e.target.value }))}>
              <option value="">No access</option>
              {a.roles.map((r) => <option key={r.name} value={r.name}>{r.label}</option>)}
            </select>
          </label>
        ))}
      </div>
      {!member && <div className="text-[11px] text-slate-500">{mode === 'password' ? 'They must choose their own password the first time they sign in.' : 'The link works once and lasts 3 days.'} An email already used by your organisation adds that person; an email of another organisation cannot be added.</div>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60">Cancel</button>
        <button type="submit" disabled={busy} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  )
}

/** Reset a member's password: a temporary one (changed at next sign-in) or an emailed link. */
function ResetForm({ member, companyId, onDone, onCancel, onLink }: {
  member: TeamMember; companyId: string; onDone: () => void; onCancel: () => void; onLink: (who: string, url: string) => void
}) {
  const { toast } = useToast()
  const [mode, setMode] = useState<'email' | 'temporary'>('email')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await iam.teamPassword(companyId, member.id, mode === 'temporary' ? { mode, password } : { mode })
      if (mode === 'email' && !r.emailed && r.link) onLink(member.fullName, r.link)
      toast(mode === 'temporary' ? 'Temporary password set' : r.emailed ? 'Reset link emailed' : 'Reset link ready', 'ok')
      onDone()
    } catch (err: any) { toast(err?.message || 'Could not reset', 'bad') }
    finally { setBusy(false) }
  }
  const inp = 'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none'
  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl border border-slate-700 bg-slate-800/40 p-3">
      <div className="text-xs font-medium text-slate-200">Reset password · {member.fullName}</div>
      <div className="flex flex-wrap gap-4 text-xs text-slate-300">
        <label className="flex items-center gap-1.5"><input type="radio" checked={mode === 'email'} onChange={() => setMode('email')} /> Email them a link to set a new password</label>
        <label className="flex items-center gap-1.5"><input type="radio" checked={mode === 'temporary'} onChange={() => setMode('temporary')} /> Give a temporary password</label>
      </div>
      {mode === 'temporary' && (
        <input className={inp + ' sm:max-w-xs'} type="text" placeholder="Temporary password (at least 6)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" required minLength={6} />
      )}
      <div className="text-[11px] text-slate-500">They are signed out everywhere{mode === 'temporary' ? ' and must choose their own password at the next sign-in' : ''}.</div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60">Cancel</button>
        <button type="submit" disabled={busy} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60">{busy ? 'Saving…' : 'Reset'}</button>
      </div>
    </form>
  )
}
