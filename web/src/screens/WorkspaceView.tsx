import { useCallback, useEffect, useState } from 'react'
import { iam, type AdminUser } from '../lib/iam'
import { roleLabel } from '../lib/util'
import { useSession } from '../context/SessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { Tier1Companies } from '../tiers/Tier1Companies'
import { Tier2Directory } from '../tiers/Tier2Directory'
import { Tier3AccessPanel } from '../tiers/Tier3AccessPanel'

// The 3-tier Workspace hub (dark): a platform header band + Tier 1/2/3 as three columns.
// Owns the shared user directory + reload (Tier 3 calls reload after each instant edit).
export function WorkspaceView() {
  const { me } = useSession()
  const { selectedCompany, selectedUser } = useWorkspace()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const list = await iam.listUsers({ status: 'all' })
      setUsers(list)
      return list
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void reload() }, [reload])

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-200">
      <div className="flex shrink-0 items-center justify-between gap-3 px-6 pt-5 pb-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-white">True Eco Identity &amp; Access Platform</h1>
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">Workspace Management Module · Core Layout</p>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
          {roleLabel(me?.globalRole) || 'Restricted'} Access
        </span>
      </div>
      <div className="flex min-h-0 flex-1 gap-4 px-6 pb-6">
        <Tier1Companies />
        <Tier2Directory users={users} loading={loading} />
        <Tier3AccessPanel user={selectedUser} company={selectedCompany} reload={reload} />
      </div>
    </div>
  )
}
