import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Company, AdminUser } from '../lib/iam'

interface WorkspaceApi {
  selectedCompany: Company | null
  selectedUser: AdminUser | null
  /** Select a company (Tier 1). Forcefully clears Tier 3 to prevent cross-tenant contamination. */
  selectCompany: (c: Company | null) => void
  selectUser: (u: AdminUser | null) => void
  /** Cross-tenant guardrail (blueprint Part 4): drop any open user / uncommitted Tier-3 edits. */
  purgeTierState: () => void
}

const Ctx = createContext<WorkspaceApi>(null as unknown as WorkspaceApi)
export const useWorkspace = () => useContext(Ctx)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [selectedCompany, setCompany] = useState<Company | null>(null)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)

  const purgeTierState = useCallback(() => setSelectedUser(null), [])

  const selectCompany = useCallback((c: Company | null) => {
    setSelectedUser(null) // purge Tier 3 on every company switch
    setCompany(c)
  }, [])

  const value = useMemo<WorkspaceApi>(
    () => ({ selectedCompany, selectedUser, selectCompany, selectUser: setSelectedUser, purgeTierState }),
    [selectedCompany, selectedUser, selectCompany, purgeTierState],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
