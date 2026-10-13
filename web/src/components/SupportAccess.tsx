import { useEffect, useState } from 'react'
import { iam, type SupportVisit } from '../lib/iam'
import { useToast } from './Toast'

/**
 * Support access (one platform, 2026-10-13). A customer's company is closed to the platform
 * team; this is the one door in — a reason, a time limit (2 hours), and a record the customer
 * sees in their own My team. Shown on a CUSTOMER company's profile only.
 */
const when = (d: string) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export function SupportAccess({ companyId, companyName }: { companyId: string; companyName: string }) {
  const { toast } = useToast()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<SupportVisit | null>(null)

  const load = () => iam.mySupport().then((r) => setOpen(r.find((v) => v.companyId === companyId) || null)).catch(() => setOpen(null))
  useEffect(() => { load() }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setBusy(true)
    try {
      await iam.startSupport(companyId, reason.trim())
      toast(`Support access to ${companyName} is open — it now appears in your app switchers`, 'ok')
      setReason(''); await load()
    } catch (e: any) { toast(e?.message || 'Could not open support access', 'bad') } finally { setBusy(false) }
  }
  const end = async () => {
    if (!open) return
    setBusy(true)
    try { await iam.endSupport(open.id); toast('Support access ended', 'ok'); await load() }
    catch (e: any) { toast(e?.message || 'Could not end it', 'bad') } finally { setBusy(false) }
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-amber-300">Customer company · support access</div>
      <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
        This company's data is closed to the platform team. To help them, open support access: you
        become its administrator in each of its apps for <b>2 hours</b>. Every visit — who, when and
        why — is shown to the customer.
      </p>
      {open ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-emerald-300">Open until {when(open.expiresAt)}</span>
          <span className="truncate text-slate-400">· {open.reason}</span>
          <button type="button" disabled={busy} onClick={end} className="ml-auto rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800/60 disabled:opacity-60">End now</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300}
            placeholder="Reason (e.g. customer asked about invoice INV-0012)"
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none" />
          <button type="button" disabled={busy || reason.trim().length < 5} onClick={start}
            className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-medium text-slate-950 hover:bg-amber-400 disabled:opacity-50">Open support access</button>
        </div>
      )}
    </div>
  )
}

/** The customer's own view: every support visit to their company. */
export function SupportVisits({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<{ id: string; by: string; reason: string; startedAt: string; endedAt: string; open: boolean }[] | null>(null)
  useEffect(() => { iam.teamSupport(companyId).then(setRows).catch(() => setRows(null)) }, [companyId])
  if (!rows) return null
  return (
    <div className="mt-5">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">Support visits by the platform team</div>
      {rows.length === 0 ? <div className="text-xs text-slate-500">None — nobody from the platform team has opened your company.</div> : (
        <div className="divide-y divide-slate-800 rounded-xl border border-slate-800">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <span className="text-slate-200">{r.by}</span>
              <span className="text-slate-500">{when(r.startedAt)} – {when(r.endedAt)}</span>
              {r.open ? <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">Open now</span> : null}
              <span className="w-full text-slate-400 sm:w-auto sm:flex-1">{r.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
