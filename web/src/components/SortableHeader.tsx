import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import type { SortState } from '../hooks/useSortable'

// Dark-themed sortable column header for the Workspace directory grid (Tier 2).
export function SortableHeader({
  label,
  sortKey,
  sortState,
  onSort,
  className = '',
}: {
  label: string
  sortKey: string
  sortState: SortState
  onSort: (key: string) => void
  className?: string
}) {
  const active = sortState?.key === sortKey
  const Icon = !active ? ChevronsUpDown : sortState!.dir === 'asc' ? ChevronUp : ChevronDown
  return (
    <th className={'border-b border-slate-800 px-3 py-2 text-left ' + className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={
          'inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-200 ' +
          (active ? 'text-emerald-300' : 'text-slate-500 hover:text-slate-300')
        }
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    </th>
  )
}
