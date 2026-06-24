import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react'
import { iam, type App, type AuditRow } from '../lib/iam'
import { useToast } from '../components/Toast'
import { StyledSelect } from '../components/StyledSelect'
import { Drawer } from '../components/Drawer'

const PAGE = 100

// Pretty-print a detail value (string passthrough, otherwise stringify).
function detailText(d: unknown): string {
  if (d == null) return ''
  return typeof d === 'string' ? d : JSON.stringify(d)
}
function clip(d: unknown, max = 80): string {
  const s = detailText(d)
  return s.length > max ? s.slice(0, max) + '…' : s
}

// CSV cell escape (quote when it contains a comma, quote, or newline).
function csvCell(v: unknown): string {
  const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

// Audit Log — read-only feed of platform events with filters, paging, detail drawer, CSV export.
export function AuditLog() {
  const { toast } = useToast()

  const [apps, setApps] = useState<App[]>([])
  const [rows, setRows] = useState<AuditRow[]>([])
  const [total, setTotal] = useState(0)
  const [actions, setActions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [action, setAction] = useState('all')
  const [appId, setAppId] = useState('all')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('') // debounced search term actually sent to the API
  const [offset, setOffset] = useState(0)

  const [selected, setSelected] = useState<AuditRow | null>(null)

  // Apps for the filter dropdown — load once on mount.
  useEffect(() => {
    iam.listApps().then(setApps).catch(() => setApps([]))
  }, [])

  // Debounce the search box (~250ms) → reset to first page.
  const searchT = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (searchT.current) clearTimeout(searchT.current)
    searchT.current = setTimeout(() => {
      setQuery(search.trim())
      setOffset(0)
    }, 250)
    return () => {
      if (searchT.current) clearTimeout(searchT.current)
    }
  }, [search])

  // Fetch the page whenever a filter or the offset changes.
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    iam
      .listAudit({ q: query, action, appId, limit: PAGE, offset })
      .then((res) => {
        if (!alive) return
        setRows(res.items || [])
        setTotal(res.total || 0)
        if (res.actions && res.actions.length) setActions(res.actions)
      })
      .catch((ex: unknown) => {
        if (!alive) return
        setRows([])
        setTotal(0)
        setError(ex instanceof Error ? ex.message : 'Failed to load audit log.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [query, action, appId, offset])

  const onAction = useCallback((v: string) => {
    setAction(v)
    setOffset(0)
  }, [])
  const onApp = useCallback((v: string) => {
    setAppId(v)
    setOffset(0)
  }, [])

  const from = total ? offset + 1 : 0
  const to = Math.min(offset + PAGE, total)
  const atStart = offset <= 0
  const atEnd = to >= total

  const filtered = query || action !== 'all' || appId !== 'all'

  // Export the current page's rows as a CSV blob download.
  const exportCsv = useCallback(() => {
    if (!rows.length) {
      toast('No audit entries to export.', 'bad')
      return
    }
    const cols: (keyof AuditRow)[] = [
      'createdAt',
      'action',
      'actorName',
      'actorUserId',
      'targetName',
      'targetUserId',
      'appId',
      'companyId',
      'detail',
    ]
    const lines = [cols.join(',')].concat(
      rows.map((r) => cols.map((c) => csvCell(r[c])).join(',')),
    )
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'audit-' + new Date().toISOString().slice(0, 10) + '.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast('Exported ' + rows.length + ' rows.', 'ok')
  }, [rows, toast])

  const detailJson = useMemo(() => {
    if (!selected) return '—'
    const d = selected.detail
    if (d == null) return '—'
    return typeof d === 'string' ? d : JSON.stringify(d, null, 2)
  }, [selected])

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-slate-50">
      {/* Top bar — filters + export */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-5 py-3">
        <div className="mr-auto">
          <h2 className="text-xs font-medium text-slate-800">Audit Log</h2>
          <p className="text-[10px] text-slate-400">{total} event{total === 1 ? '' : 's'}</p>
        </div>

        <StyledSelect value={action} onChange={onAction} className="w-44">
          <option value="all">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </StyledSelect>

        <StyledSelect value={appId} onChange={onApp} className="w-44">
          <option value="all">All apps</option>
          {apps.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </StyledSelect>

        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 transition-all duration-200 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search audit…"
            className="w-44 bg-transparent text-xs placeholder:text-slate-400 focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={exportCsv}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-all duration-200 hover:bg-slate-50"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-5 py-3">
        <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-50">
                {['When', 'Action', 'Actor', 'Target', 'App', 'Detail'].map((h) => (
                  <th
                    key={h}
                    className="border-b border-slate-100 px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-slate-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-xs text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-xs text-rose-500">
                    {error}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-xs text-slate-400">
                    No audit entries{filtered ? ' for this filter' : ' yet'}.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr
                    key={r.id ?? i}
                    onClick={() => setSelected(r)}
                    className="cursor-pointer bg-white transition-all duration-200 hover:bg-slate-50"
                  >
                    <td className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {r.action}
                      </span>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-xs text-slate-600">
                      {r.actorName || r.actorUserId || '—'}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-xs text-slate-600">
                      {r.targetName || r.targetUserId || '—'}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-xs text-slate-400">
                      {r.appId || '—'}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-xs text-slate-400">
                      {clip(r.detail) || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pager */}
      <div className="flex items-center justify-between border-t border-slate-200 bg-white px-5 py-2.5">
        <span className="text-[10px] text-slate-400">
          {from}–{to} of {total}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={atStart}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-all duration-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Prev</span>
          </button>
          <button
            type="button"
            disabled={atEnd}
            onClick={() => setOffset((o) => o + PAGE)}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-all duration-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>Next</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Detail drawer */}
      <Drawer open={!!selected} onClose={() => setSelected(null)} title="Audit entry" width="max-w-md">
        {selected && (
          <div className="text-xs text-slate-600">
            <DetailRow label="When" value={new Date(selected.createdAt).toLocaleString()} />
            <DetailRow
              label="Action"
              value={
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                  {selected.action}
                </span>
              }
            />
            <DetailRow label="Actor" value={selected.actorName || selected.actorUserId || '—'} />
            <DetailRow label="Target" value={selected.targetName || selected.targetUserId || '—'} />
            <DetailRow label="App" value={selected.appId || '—'} />
            <DetailRow label="Company" value={selected.companyId || '—'} />
            <div className="mt-3">
              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Detail</span>
              <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-[10px] text-slate-600">
                {detailJson}
              </pre>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-slate-100 py-2">
      <span className="w-16 shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <div className="min-w-0 break-words">{value}</div>
    </div>
  )
}
