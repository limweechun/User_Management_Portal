import { useState, type ReactNode } from 'react'
import { LayoutGrid, AppWindow, MessageSquare, History, Settings as SettingsIcon, Grid2x2, LogOut, Settings2 } from 'lucide-react'
import { isPortalAdmin } from '../lib/iam'
import { useSession } from '../context/SessionContext'
import { roleLabel, initials } from '../lib/util'
import { PersonalSettings } from '../components/PersonalSettings'
import { WorkspaceView } from './WorkspaceView'
import { AppsRegistry } from './AppsRegistry'
import { FeedbackCenter } from './FeedbackCenter'
import { AuditLog } from './AuditLog'
import { Settings } from './Settings'

type Tab = 'workspace' | 'apps' | 'feedback' | 'audit' | 'settings'

// The admin section shell: top bar with the section nav + the active screen. The Workspace tab
// is the 3-tier grid (full height, no padding); the others scroll in a padded container.
export function AdminLayout({ onSignOut, onExit }: { onSignOut: () => void; onExit: () => void }) {
  const { me } = useSession()
  const [tab, setTab] = useState<Tab>('workspace')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const portalAdmin = isPortalAdmin(me)

  const allTabs: { id: Tab; label: string; icon: ReactNode; show: boolean }[] = [
    { id: 'workspace', label: 'Workspace', icon: <LayoutGrid className="h-3.5 w-3.5" />, show: true },
    { id: 'apps', label: 'Apps', icon: <AppWindow className="h-3.5 w-3.5" />, show: portalAdmin },
    { id: 'feedback', label: 'Feedback', icon: <MessageSquare className="h-3.5 w-3.5" />, show: true },
    { id: 'audit', label: 'Audit', icon: <History className="h-3.5 w-3.5" />, show: true },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon className="h-3.5 w-3.5" />, show: portalAdmin },
  ]
  const tabs = allTabs.filter((t) => t.show)

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-4">
          <button onClick={onExit} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-500 transition-all duration-200 hover:bg-slate-50" title="Back to Apps Portal">
            <Grid2x2 className="h-3.5 w-3.5" /> Apps Portal
          </button>
          <nav className="flex items-center gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ' +
                  (tab === t.id ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700')
                }
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSettingsOpen(true)} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1 transition-all duration-200 hover:bg-slate-50" title="Personal settings">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-50 text-[9px] font-medium text-emerald-700">{initials(me?.user.fullName)}</span>
            <span className="hidden text-[11px] text-slate-500 md:inline">{me?.user.fullName} · {roleLabel(me?.globalRole)}</span>
            <Settings2 className="h-3.5 w-3.5 text-slate-400" />
          </button>
          <button onClick={onSignOut} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-all duration-200 hover:bg-slate-50" title="Sign out" aria-label="Sign out">
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        {tab === 'workspace' ? (
          <WorkspaceView />
        ) : (
          <div className="h-full overflow-auto px-6 py-5">
            <div className="mx-auto max-w-6xl">
              {tab === 'apps' ? <AppsRegistry /> : null}
              {tab === 'feedback' ? <FeedbackCenter /> : null}
              {tab === 'audit' ? <AuditLog /> : null}
              {tab === 'settings' ? <Settings /> : null}
            </div>
          </div>
        )}
      </div>

      <PersonalSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
