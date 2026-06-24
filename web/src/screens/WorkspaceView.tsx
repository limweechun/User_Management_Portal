import { useCallback, useEffect, useState } from 'react'
import { iam, type AdminUser } from '../lib/iam'
import { useWorkspace } from '../context/WorkspaceContext'
import { Tier1Companies } from '../tiers/Tier1Companies'
import { Tier2Directory } from '../tiers/Tier2Directory'
import { Tier3AccessPanel } from '../tiers/Tier3AccessPanel'
import { Drawer } from '../components/Drawer'

// The 3-tier Workspace grid body (Tier1 + Tier2 + Tier3 drawer). Rendered as the first tab of
// the admin layout; owns the shared user directory + reload (Tier3 calls reload after edits).
export function WorkspaceView() {
  const { selectedCompany, selectedUser, selectUser } = useWorkspace()
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
    <div className="flex h-full overflow-hidden">
      <Tier1Companies />
      <Tier2Directory users={users} loading={loading} />
      <Drawer open={!!selectedUser} onClose={() => selectUser(null)} title={selectedUser?.fullName ?? ''} width="max-w-xl">
        {selectedUser && selectedCompany ? (
          <Tier3AccessPanel user={selectedUser} company={selectedCompany} reload={reload} />
        ) : null}
      </Drawer>
    </div>
  )
}
