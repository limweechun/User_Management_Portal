import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, Pencil, Trash2, Box, Save } from 'lucide-react'
import { iam, isSuperAdmin, type App } from '../lib/iam'
import { useSession } from '../context/SessionContext'
import { useToast } from '../components/Toast'
import { Toggle } from '../components/Toggle'
import { Drawer } from '../components/Drawer'

// Apps Registry — the platform app catalog (ported 1:1 from the legacy app.js renderApps +
// openAppDrawer + deriveAppId). Each app can be taken live/off, put into maintenance
// (Super-Admin only), edited, or deleted (Super-Admin only).

// Auto-assign an App ID: first letter of each word (up to 6) + a 2-digit series number
// (next free for that prefix). e.g. "Tex Cycle Biomass Power Plant" → tcbpp01.
function deriveAppId(fullName: string, existing: App[]): string {
  const initials = String(fullName || '')
    .trim()
    .split(/\s+/)
    .map((w) => (w.match(/[a-z]/i) || [''])[0]) // first alphabet of the word
    .filter(Boolean)
    .slice(0, 6)
    .join('')
    .toLowerCase()
  if (!initials) return ''
  const used = new Set(existing.map((a) => a.id))
  let n = 1
  let id = ''
  do {
    id = initials + String(n).padStart(2, '0')
    n++
  } while (used.has(id))
  return id
}

interface FormState {
  name: string
  shortName: string
  icon: string
  active: boolean
  maintenanceMode: boolean
  maintenanceMessage: string
}

const EMPTY: FormState = {
  name: '',
  shortName: '',
  icon: 'box',
  active: true,
  maintenanceMode: false,
  maintenanceMessage: '',
}

// Small slate chip showing the lucide icon NAME (we intentionally do not dynamically import
// every lucide icon — see prompt). A generic Box stands in as the visual placeholder.
function IconChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-800/40 px-2 py-1 text-[10px] font-medium text-slate-400">
      <Box className="h-3.5 w-3.5 text-slate-500" />
      {name || 'box'}
    </span>
  )
}

export function AppsRegistry() {
  const { me } = useSession()
  const { toast } = useToast()
  const canSuper = isSuperAdmin(me)

  const [apps, setApps] = useState<App[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<App | null>(null)
  const [form, setForm] = useState<FormState>({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setApps(await iam.listApps())
    } catch (err: any) {
      toast(err?.message || 'Could not load apps', 'bad')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  // Toggle an app live/off directly from the table.
  const toggleLive = useCallback(
    async (a: App, next: boolean) => {
      setBusyId(a.id)
      try {
        await iam.updateApp(a.id, { active: next })
        toast(next ? 'App is now live.' : 'App taken offline.', 'ok')
        await load()
      } catch (err: any) {
        toast(err?.message || 'Could not update app', 'bad')
      } finally {
        setBusyId(null)
      }
    },
    [load, toast],
  )

  // Toggle an app into/out of maintenance — Super-Admin only.
  const toggleMaint = useCallback(
    async (a: App, next: boolean) => {
      if (!canSuper) {
        toast('Restricted to Super Admins', 'bad')
        return
      }
      setBusyId(a.id)
      try {
        await iam.setAppMaintenance(a.id, next, a.maintenanceMessage || '')
        toast(next ? 'App put into maintenance.' : 'App back online.', 'ok')
        await load()
      } catch (err: any) {
        toast(err?.message || 'Could not update maintenance', 'bad')
      } finally {
        setBusyId(null)
      }
    },
    [canSuper, load, toast],
  )

  const removeApp = useCallback(
    async (a: App) => {
      if (!canSuper) {
        toast('Restricted to Super Admins', 'bad')
        return
      }
      if (
        !window.confirm(
          `Delete "${a.name}" from the catalog?\n\nThis removes the app and everyone's access to it. This can't be undone.`,
        )
      )
        return
      setBusyId(a.id)
      try {
        await iam.deleteApp(a.id)
        toast('App deleted.', 'ok')
        await load()
      } catch (err: any) {
        toast(err?.message || 'Could not delete app', 'bad')
      } finally {
        setBusyId(null)
      }
    },
    [canSuper, load, toast],
  )

  const openCreate = useCallback(() => {
    setEditing(null)
    setForm({ ...EMPTY })
    setError('')
    setDrawerOpen(true)
  }, [])

  const openEdit = useCallback((a: App) => {
    setEditing(a)
    setForm({
      name: a.name,
      shortName: a.shortName || '',
      icon: a.icon || 'box',
      active: a.active !== false,
      maintenanceMode: !!a.maintenanceMode,
      maintenanceMessage: a.maintenanceMessage || '',
    })
    setError('')
    setDrawerOpen(true)
  }, [])

  // App ID: read-only when editing (permanent); auto-derived from the name on create.
  const derivedId = useMemo(
    () => (editing ? editing.id : deriveAppId(form.name, apps)),
    [editing, form.name, apps],
  )

  const submit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      setError('')
      const id = editing ? editing.id : derivedId
      if (!editing && !/^[a-z]{1,6}[0-9]{2}$/.test(id)) {
        setError('Enter a full name so an App ID can be auto-assigned.')
        return
      }
      const name = form.name.trim()
      const shortName = form.shortName.trim()
      const icon = form.icon.trim() || 'box'
      setSaving(true)
      try {
        if (editing) {
          await iam.updateApp(id, { name, shortName, icon, active: form.active })
          // Maintenance is a separate, Super-Admin-only endpoint.
          if (canSuper) {
            await iam.setAppMaintenance(id, form.maintenanceMode, form.maintenanceMessage.trim())
          }
        } else {
          await iam.createApp({
            id,
            name,
            shortName,
            icon,
            url: '/' + id, // proxied apps always launch at /<id>
            active: form.active,
          })
        }
        setDrawerOpen(false)
        toast(editing ? 'App updated.' : 'App created.', 'ok')
        await load()
      } catch (err: any) {
        setError(err?.message || 'Could not save app')
      } finally {
        setSaving(false)
      }
    },
    [editing, derivedId, form, canSuper, load, toast],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-medium text-slate-200">Apps Registry</h2>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">{apps.length}</span>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-medium text-slate-950 transition-all duration-200 hover:bg-emerald-400"
        >
          <Plus className="h-3.5 w-3.5" /> Add app
        </button>
      </div>

      <div className="flex-1 overflow-auto p-5">
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <table className="w-full text-xs text-slate-200">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/40 text-left">
                <th className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">App ID</th>
                <th className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">Name</th>
                <th className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">Short name</th>
                <th className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">Live</th>
                {canSuper && (
                  <th className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    Maintenance
                  </th>
                )}
                <th className="px-4 py-2.5 text-right text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canSuper ? 6 : 5} className="px-4 py-6 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : apps.length === 0 ? (
                <tr>
                  <td colSpan={canSuper ? 6 : 5} className="px-4 py-6 text-center text-slate-500">
                    No apps.
                  </td>
                </tr>
              ) : (
                apps.map((a) => {
                  const live = a.active !== false
                  const busy = busyId === a.id
                  return (
                    <tr
                      key={a.id}
                      className={
                        'border-b border-slate-800 transition-all duration-200 last:border-0 hover:bg-slate-800/50 ' +
                        (live ? '' : 'opacity-60')
                      }
                    >
                      <td className="px-4 py-2.5">
                        <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
                          {a.id}
                        </code>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-slate-200">{a.name}</span>
                        {a.maintenanceMode && (
                          <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-amber-500/30">
                            Maintenance
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {a.shortName ? a.shortName : <span className="text-slate-500">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <Toggle checked={live} onChange={(v) => void toggleLive(a, v)} disabled={busy} />
                      </td>
                      {canSuper && (
                        <td className="px-4 py-2.5">
                          <Toggle
                            checked={!!a.maintenanceMode}
                            onChange={(v) => void toggleMaint(a, v)}
                            disabled={busy}
                          />
                        </td>
                      )}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEdit(a)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-all duration-200 hover:bg-slate-800/60"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                          {canSuper && (
                            <button
                              onClick={() => void removeApp(a)}
                              disabled={busy}
                              title="Delete app"
                              className="inline-flex items-center rounded-lg border border-slate-800 px-2 py-1.5 text-slate-500 transition-all duration-200 hover:border-rose-500/30 hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? `Edit app — ${editing.name}` : 'New app'}
        side="right"
        width="max-w-md"
      >
        <form onSubmit={submit} className="space-y-3">
          <p className="text-xs text-slate-500">
            {editing
              ? "Update this app's display details. The App ID can't be changed."
              : 'Register an app in the platform catalog. The App ID is auto-assigned from the name.'}
          </p>

          <label className="block">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">Full name</span>
            <input
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="e.g. Tex Cycle Biomass Power Plant"
              required
              autoFocus
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 transition-all duration-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/20"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
              App ID <span className="lowercase tracking-normal text-slate-500">(auto-assigned, permanent)</span>
            </span>
            <input
              value={derivedId}
              readOnly
              placeholder="—"
              className="w-full cursor-not-allowed rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2 font-mono text-xs text-slate-400"
            />
            {!editing && (
              <span className="mt-1 block text-[10px] text-slate-500">
                First letter of each word (up to 6) + a 2-digit series number. The app opens at{' '}
                <code className="rounded bg-slate-800 px-1 py-0.5 font-mono text-slate-400">
                  {derivedId ? '/' + derivedId : '/…'}
                </code>
                .
              </span>
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">Short name</span>
            <input
              value={form.shortName}
              onChange={(e) => setForm((s) => ({ ...s, shortName: e.target.value }))}
              placeholder="e.g. PSM"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 transition-all duration-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/20"
            />
          </label>

          <label className="block">
            <span className="mb-1 flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-slate-500">
              <span>Icon (lucide name)</span>
              <IconChip name={form.icon.trim()} />
            </span>
            <input
              value={form.icon}
              onChange={(e) => setForm((s) => ({ ...s, icon: e.target.value }))}
              placeholder="e.g. shopping-cart"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 transition-all duration-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/20"
            />
          </label>

          <div className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-2">
            <div>
              <div className="text-xs font-medium text-slate-200">Live</div>
              <div className="text-[10px] text-slate-500">Show this app in the launcher.</div>
            </div>
            <Toggle checked={form.active} onChange={(v) => setForm((s) => ({ ...s, active: v }))} />
          </div>

          {canSuper && (
            <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-800/40 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-200">Maintenance mode</div>
                  <div className="text-[10px] text-slate-500">Block non-admins from this app.</div>
                </div>
                <Toggle
                  checked={form.maintenanceMode}
                  onChange={(v) => setForm((s) => ({ ...s, maintenanceMode: v }))}
                />
              </div>
              <label className="block">
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  Maintenance message
                </span>
                <textarea
                  value={form.maintenanceMessage}
                  onChange={(e) => setForm((s) => ({ ...s, maintenanceMessage: e.target.value }))}
                  rows={2}
                  placeholder={`e.g. ${form.name || 'This app'} is down for scheduled maintenance.`}
                  className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 transition-all duration-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/20"
                />
              </label>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 ring-1 ring-rose-500/30">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="rounded-lg border border-slate-800 px-4 py-2 text-xs font-medium text-slate-300 transition-all duration-200 hover:bg-slate-800/60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 transition-all duration-200 hover:bg-emerald-400 disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create app'}
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  )
}
