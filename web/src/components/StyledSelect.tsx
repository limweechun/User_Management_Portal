import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

// High-class custom select: native <select> (accessible) styled with the emerald focus ring.
export function StyledSelect({
  value,
  onChange,
  children,
  disabled,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  children: ReactNode
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={'relative ' + className}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white px-3 py-1.5 pr-8 text-xs font-medium text-slate-700 transition-all duration-200 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
    </div>
  )
}
