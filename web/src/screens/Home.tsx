import { useState } from 'react'
import { canUsePortal } from '../lib/iam'
import { useSession } from '../context/SessionContext'
import { Launcher } from './Launcher'
import { AdminLayout } from './AdminLayout'

// Post-login home: the app launcher, with the admin (Workspace hub) reachable from the
// "User Management" tile — mirroring the legacy launcher → bootPortal() flow.
export function Home({ onSignOut }: { onSignOut: () => void }) {
  const { me } = useSession()
  const [view, setView] = useState<'launcher' | 'admin'>('launcher')

  if (view === 'admin' && canUsePortal(me)) {
    return <AdminLayout onSignOut={onSignOut} onExit={() => setView('launcher')} />
  }
  return <Launcher onSignOut={onSignOut} onOpenAdmin={() => setView('admin')} />
}
