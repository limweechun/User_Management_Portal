import type { Me } from './iam'
import { isSuperAdmin } from './iam'

// Blueprint Part 4 — authorization role gate. Elevating an account to App Admin / Portal Admin
// or toggling deletion-approval rights is restricted to Super Admins. The server re-enforces
// this (admin.routes.ts requireSuperadmin); this client gate is fast, explicit UX feedback.
export function requireSuperAdmin(
  me: Me | null,
  toast: (msg: string, kind?: 'bad' | 'ok' | 'info') => void,
): boolean {
  if (isSuperAdmin(me)) return true
  toast(
    'Hard stop: system-administration changes and deletion-approval elevations are restricted to Super Admins only.',
    'bad',
  )
  return false
}
