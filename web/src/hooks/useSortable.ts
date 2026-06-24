import { useMemo, useState } from 'react'

export type SortDir = 'asc' | 'desc'
export type SortState = { key: string; dir: SortDir } | null

// Locale/numeric-aware comparator; nulls/empties always sort last.
function cmp(a: unknown, b: unknown): number {
  const an = a == null || a === ''
  const bn = b == null || b === ''
  if (an && bn) return 0
  if (an) return 1
  if (bn) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

export interface SortableApi<T> {
  sorted: T[]
  sortState: SortState
  /** Cycle a column: unsorted → ascending → descending → reset (unsorted). */
  toggle: (key: string) => void
}

// Generic + reusable suite-wide. `accessors` maps a column key → a value extractor.
// Pass a STABLE accessors object (module const or useMemo) so sorting memoizes cleanly.
export function useSortable<T>(rows: T[], accessors: Record<string, (row: T) => unknown>): SortableApi<T> {
  const [sortState, setSortState] = useState<SortState>(null)

  const toggle = (key: string) =>
    setSortState((s) => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }))

  const sorted = useMemo(() => {
    if (!sortState) return rows
    const acc = accessors[sortState.key]
    if (!acc) return rows
    const out = [...rows].sort((x, y) => cmp(acc(x), acc(y)))
    if (sortState.dir === 'desc') out.reverse()
    return out
  }, [rows, sortState, accessors])

  return { sorted, sortState, toggle }
}
