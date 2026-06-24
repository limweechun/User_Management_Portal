import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import type { SortState } from '../hooks/useSortable'

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
    <th className={'px-3 py-2 text-left ' + className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={
          'inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide transition-colors duration-200 ' +
          (active ? 'text-emerald-700' : 'text-slate-400 hover:text-slate-600')
        }
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    </th>
  )
}
