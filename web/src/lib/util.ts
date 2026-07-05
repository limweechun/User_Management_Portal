import type { GlobalRole } from './iam'

export const initials = (n?: string) =>
  (n || '?').trim().split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?'

export const GLOBAL_ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: 'Super Admin',
  ADMIN: 'Portal Admin',
  DIRECTOR: 'Director',
  ORDINARY_USER: 'Ordinary User',
  NEW_USER: 'New User',
}
export const roleLabel = (r?: string | null) => (r ? GLOBAL_ROLE_LABELS[r] || r : '')

// Compact date for the directory + account panels, e.g. "21 Jun 2026". '—' for empty/invalid.
export const fmtDate = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// The global role ladder (low → high), used by the account-role selector.
// Director retired as an assignable global (2026-07-05, owner decision) — existing
// holders keep working (roleLabel still resolves it); the picker no longer offers it.
export const GLOBAL_ROLE_OPTIONS: { value: GlobalRole; label: string }[] = [
  { value: 'NEW_USER', label: 'New User' },
  { value: 'ORDINARY_USER', label: 'Ordinary User' },
  { value: 'ADMIN', label: 'Portal Admin' },
  { value: 'SUPERADMIN', label: 'Super Admin' },
]
