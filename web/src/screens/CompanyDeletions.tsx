import { useEffect, useState } from 'react'
import { RefreshCw, Check, X, Ban, ShieldAlert, Clock } from 'lucide-react'
import { iam, isSuperAdmin, COMPANY_DELETION_APPROVALS_REQUIRED as NEED, type CompanyDeletionRequest } from '../lib/iam'
import { useSession } from '../context/SessionContext'
import { useToast } from '../components/Toast'

// Company deletion (retire) approvals. A portal admin files a request from the
// company profile; retiring the company (→ inactive) needs TWO distinct
// Super-Admin/Admin approvals here. Any single reject cancels it.
export function CompanyDeletions() {
  const { me } = useSession()
  const { toast } = useToast()
  const meId = me?.user.id
  const [rows, setRows] = useState<CompanyDeletionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setRows(await iam.listCompanyDeletionRequests()) } catch (e: any) { toast(e?.message || 'Could not load requests', 'bad') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const approvals = (r: CompanyDeletionRequest) => r.approvals.filter((a) => a.decision === 'approve').length
  const iVoted = (r: CompanyDeletionRequest) => r.approvals.some((a) => a.approverUserId === meId)

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); toast(ok, 'ok'); await load() } catch (e: any) { toast(e?.message || 'Action failed', 'bad') } finally { setBusy(false) }
  }

  const pending = rows.filter((r) => r.status === 'PENDING')
  const history = rows.filter((r) => r.status !== 'PENDING')

  const badge = (s: CompanyDeletionRequest['status']) => {
    const m: Record<string, string> = {
      PENDING: 'bg-amber-500/15 text-amber-300', APPROVED: 'bg-rose-500/15 text-rose-300',
      REJECTED: 'bg-slate-600/30 text-slate-300', CANCELLED: 'bg-slate-600/30 text-slate-400',
    }
    const label: Record<string, string> = { PENDING: 'Pending', APPROVED: 'Retired', REJECTED: 'Rejected', CANCELLED: 'Cancelled' }
    return <span className={'rounded-full px-2 py-0.5 text-[10px] font-medium ' + (m[s] || '')}>{label[s] || s}</span>
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium text-slate-100"><ShieldAlert className="h-4 w-4 text-rose-400" /> Company deletions</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">Retiring a company needs {NEED} sign-offs — the requester plus {NEED - 1} other Super-Admin / Admin. Filed from a company's profile.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition-all duration-200 hover:bg-slate-800 disabled:opacity-60">
          <RefreshCw className={'h-3.5 w-3.5 ' + (loading ? 'animate-spin' : '')} /> Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-5">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400"><Clock className="h-3 w-3" /> Pending ({pending.length})</div>
            {pending.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-6 text-center text-xs text-slate-500">No pending company deletions.</div>
            ) : (
              <div className="space-y-2">
                {pending.map((r) => {
                  const mine = r.requestedBy === meId
                  const voted = iVoted(r)
                  return (
                    <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-medium text-slate-100">{r.companyName} {badge(r.status)}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500">Requested by {r.requestedByName || 'admin'} · {new Date(r.createdAt).toLocaleString()}</div>
                          {r.reason ? <div className="mt-1 text-xs text-slate-300">“{r.reason}”</div> : null}
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-emerald-300">{approvals(r) + 1}<span className="text-sm text-slate-500">/{NEED}</span></div>
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">sign-offs</div>
                        </div>
                      </div>

                      {r.approvals.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {r.approvals.map((a) => (
                            <span key={a.id} className={'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ' + (a.decision === 'approve' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300')}>
                              {a.decision === 'approve' ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}{a.approverName || 'admin'}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="mt-3 flex items-center gap-2">
                        {mine ? (
                          <span className="text-[11px] text-slate-500">You raised this — a different admin must approve it.</span>
                        ) : voted ? (
                          <span className="text-[11px] text-slate-500">You've already voted on this request.</span>
                        ) : (
                          <>
                            <button disabled={busy} onClick={() => run(() => iam.approveCompanyDeletion(r.id), 'Approval recorded')} className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 transition-all duration-200 hover:bg-emerald-400 disabled:opacity-60"><Check className="h-3.5 w-3.5" /> Approve</button>
                            <button disabled={busy} onClick={() => run(() => iam.rejectCompanyDeletion(r.id), 'Request rejected')} className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-medium text-rose-300 transition-all duration-200 hover:bg-rose-500/10 disabled:opacity-60"><X className="h-3.5 w-3.5" /> Reject</button>
                          </>
                        )}
                        {(mine || isSuperAdmin(me)) && (
                          <button disabled={busy} onClick={() => run(() => iam.cancelCompanyDeletion(r.id), 'Request cancelled')} className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-400 transition-all duration-200 hover:bg-slate-800 disabled:opacity-60"><Ban className="h-3.5 w-3.5" /> Cancel</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {history.length > 0 && (
            <div>
              <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">History</div>
              <div className="overflow-hidden rounded-xl border border-slate-800">
                <table className="w-full text-xs">
                  <thead><tr className="bg-slate-900/60 text-left text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-medium">Company</th><th className="px-3 py-2 font-medium">Outcome</th><th className="px-3 py-2 font-medium">Requested by</th><th className="px-3 py-2 font-medium">Resolved</th>
                  </tr></thead>
                  <tbody>
                    {history.map((r) => (
                      <tr key={r.id} className="border-t border-slate-800/70 text-slate-300">
                        <td className="px-3 py-2">{r.companyName}</td>
                        <td className="px-3 py-2">{badge(r.status)}</td>
                        <td className="px-3 py-2 text-slate-400">{r.requestedByName || '—'}</td>
                        <td className="px-3 py-2 text-slate-500">{r.resolvedAt ? new Date(r.resolvedAt).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
