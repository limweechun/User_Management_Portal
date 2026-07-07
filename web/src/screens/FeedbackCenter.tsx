import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MessageSquare, Inbox, Eye, CheckCircle, Search, Download, Paperclip } from 'lucide-react'
import { iam, type Feedback, type App } from '../lib/iam'
import { useToast } from '../components/Toast'
import { StyledSelect } from '../components/StyledSelect'
import { Drawer } from '../components/Drawer'

// Central Feedback Center — every app's feedback in one filtered, sortable table.
// Ported 1:1 from the legacy app.js renderFeedback (filters → stats → table → detail drawer → CSV).
const FB_CAT: Record<string, string> = { general: 'General', bug: 'Bug', idea: 'Idea', complaint: 'Complaint' }
const STATUSES: Feedback['status'][] = ['new', 'reviewed', 'resolved']
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const stars = (n?: number | null) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '')
const clip = (s: string) => (s.length > 60 ? s.slice(0, 60) + '…' : s)
const fmtSize = (n: number) => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB')

export function FeedbackCenter() {
  const { toast } = useToast()
  const [apps, setApps] = useState<App[]>([])
  const [rows, setRows] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters.
  const [app, setApp] = useState('all')
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('') // live input value
  const [q, setQ] = useState('') // debounced query that actually drives the fetch

  const [detail, setDetail] = useState<Feedback | null>(null)

  // Resolve an app id to its display name (falls back to the raw id).
  const appName = useCallback(
    (id: string) => apps.find((a) => a.id === id)?.name || id,
    [apps],
  )

  // Debounce the search box (~250ms) before it triggers a refetch.
  const searchT = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (searchT.current) clearTimeout(searchT.current)
    searchT.current = setTimeout(() => setQ(search.trim()), 250)
    return () => { if (searchT.current) clearTimeout(searchT.current) }
  }, [search])

  // App catalog (for the filter dropdown + name lookup) loaded once on mount.
  useEffect(() => {
    iam.listApps().then(setApps).catch(() => setApps([]))
  }, [])

  // (Re)fetch the feedback rows whenever a filter or the debounced query changes.
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await iam.listFeedback({ app, status, q })
      setRows(list)
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Failed to load feedback.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [app, status, q])
  useEffect(() => { void load() }, [load])

  // Stat-card counts over the currently-loaded (filtered) rows.
  const counts = useMemo(() => {
    const c = { new: 0, reviewed: 0, resolved: 0 }
    rows.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1 })
    return c
  }, [rows])

  // Inline status change → persist, reload, toast.
  const changeStatus = useCallback(
    async (id: string, next: string) => {
      try {
        await iam.setFeedbackStatus(id, next)
        await load()
        toast('Status updated.', 'ok')
      } catch (ex) {
        toast(ex instanceof Error ? ex.message : 'Failed to update status.', 'bad')
      }
    },
    [load, toast],
  )

  // Export the loaded rows as a CSV file, escaping quotes per RFC 4180.
  const exportCsv = useCallback(() => {
    if (!rows.length) { toast('No feedback to export.', 'bad'); return }
    const cols: (keyof Feedback)[] = ['createdAt', 'appId', 'name', 'email', 'category', 'rating', 'status', 'pageUrl', 'message']
    const escCsv = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const lines = [cols.join(',')].concat(rows.map((r) => cols.map((c) => escCsv(r[c])).join(',')))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'feedback-' + new Date().toISOString().slice(0, 10) + '.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast('Exported ' + rows.length + ' rows.', 'ok')
  }, [rows, toast])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-800/40 text-xs text-slate-300">
      {/* Header + controls */}
      <div className="shrink-0 border-b border-slate-800 bg-slate-900 px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
            <MessageSquare className="h-4 w-4 text-emerald-400" /> Feedback Center
          </div>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all duration-200 hover:bg-slate-800/60"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StyledSelect value={app} onChange={setApp} className="w-48" tone="dark">
            <option value="all">All apps</option>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </StyledSelect>

          <StyledSelect value={status} onChange={setStatus} className="w-40" tone="dark">
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{cap(s)}</option>
            ))}
          </StyledSelect>

          <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1.5 transition-all duration-200 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/20">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search feedback…"
              className="w-56 bg-transparent text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Stat cards */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label="Total" value={rows.length} icon={<MessageSquare className="h-4 w-4 text-slate-400" />} />
          <StatCard label="New" value={counts.new} icon={<Inbox className="h-4 w-4 text-slate-400" />} />
          <StatCard label="Reviewed" value={counts.reviewed} icon={<Eye className="h-4 w-4 text-slate-400" />} />
          <StatCard label="Resolved" value={counts.resolved} icon={<CheckCircle className="h-4 w-4 text-slate-400" />} />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-5">
        <div className="rounded-xl border border-slate-800 bg-slate-900">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                {['App', 'From', 'Category', 'Feedback', 'Rating', 'Status', 'When'].map((h) => (
                  <th
                    key={h}
                    className="border-b border-slate-800 px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-slate-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-xs text-slate-400">Loading…</td></tr>
              ) : error ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-xs text-rose-400">{error}</td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-xs text-slate-400">
                    {app !== 'all' || status !== 'all' || q ? 'No feedback for this filter.' : 'No feedback yet.'}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setDetail(r)}
                    className="cursor-pointer bg-slate-900 transition-all duration-200 hover:bg-slate-800/50"
                  >
                    <td className="border-b border-slate-800 px-3 py-2">
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-300">{appName(r.appId)}</span>
                    </td>
                    <td className="border-b border-slate-800 px-3 py-2">
                      <div className="text-xs font-medium text-slate-200">{r.name || '—'}</div>
                      {r.email ? <div className="text-[10px] text-slate-400">{r.email}</div> : null}
                    </td>
                    <td className="border-b border-slate-800 px-3 py-2 text-xs text-slate-400">{FB_CAT[r.category] || r.category}</td>
                    <td className="border-b border-slate-800 px-3 py-2 text-xs text-slate-300">
                      {clip(r.message)}
                      {r.attachments && r.attachments.length > 0 ? (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400" title={r.attachments.map((a) => a.name).join(', ')}>
                          <Paperclip className="h-3 w-3" /> {r.attachments.length}
                        </span>
                      ) : null}
                    </td>
                    <td className="border-b border-slate-800 px-3 py-2 text-xs text-amber-400" title={r.rating ? String(r.rating) : ''}>{stars(r.rating)}</td>
                    <td className="border-b border-slate-800 px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <StyledSelect value={r.status} onChange={(v) => void changeStatus(r.id, v)} className="w-32" tone="dark">
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{cap(s)}</option>
                        ))}
                      </StyledSelect>
                    </td>
                    <td className="border-b border-slate-800 px-3 py-2 text-[10px] text-slate-400">{new Date(r.createdAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail drawer */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} title="Feedback detail">
        {detail ? (
          <div className="space-y-4">
            <dl className="space-y-0">
              <Meta label="App" value={appName(detail.appId)} />
              <Meta
                label="From"
                value={
                  <span>
                    <span className="font-medium text-slate-200">{detail.name || '—'}</span>
                    {detail.email ? <span className="ml-1.5 text-[10px] text-slate-400">{detail.email}</span> : null}
                  </span>
                }
              />
              <Meta label="Category" value={FB_CAT[detail.category] || detail.category} />
              <Meta label="Rating" value={<span className="text-amber-400">{detail.rating ? stars(detail.rating) : '—'}</span>} />
              <Meta label="Status" value={<span className="capitalize">{detail.status}</span>} />
              {detail.pageUrl ? (
                <Meta label="Page" value={<code className="break-all rounded bg-slate-800/40 px-1.5 py-0.5 text-[10px] text-slate-400">{detail.pageUrl}</code>} />
              ) : null}
              <Meta label="Created" value={new Date(detail.createdAt).toLocaleString()} />
              <Meta label="Updated" value={new Date(detail.updatedAt).toLocaleString()} />
            </dl>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Message</div>
              <div className="mt-1.5 whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-800/40 px-3 py-2.5 text-xs text-slate-200">
                {detail.message}
              </div>
            </div>
            {detail.attachments && detail.attachments.length > 0 ? (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">Attachments ({detail.attachments.length})</div>
                <div className="mt-1.5 space-y-1">
                  {detail.attachments.map((a) => (
                    <a
                      key={a.id}
                      href={iam.feedbackAttachmentUrl(detail.id, a.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-800/40 px-3 py-2 text-xs text-slate-200 transition-all duration-200 hover:border-emerald-500/40 hover:bg-slate-800"
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate">{a.name}</span>
                      <span className="shrink-0 text-[10px] text-slate-500">{fmtSize(a.size)}</span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}

// Metric card — matches the project's rounded-lg bg-slate-50 stat tile.
function StatCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
        <div className="text-base font-medium text-slate-200">{value}</div>
      </div>
      {icon}
    </div>
  )
}

// One label/value row inside the detail drawer.
function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-slate-800 py-2 last:border-0">
      <dt className="w-20 shrink-0 text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="min-w-0 flex-1 text-xs text-slate-300">{value}</dd>
    </div>
  )
}
