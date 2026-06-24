import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

// High-class custom select: native <select> (accessible) styled with the emerald focus ring.
// `tone="dark"` is the slate-800 variant used inside the dark Workspace hub.
export function StyledSelect({
  value,
  onChange,
  children,
  disabled,
  className = '',
  tone = 'light',
}: {
  value: string
  onChange: (v: string) => void
  children: ReactNode
  disabled?: boolean
  className?: string
  tone?: 'light' | 'dark'
}) {
  const dark = tone === 'dark'
  return (
    <div className={'relative ' + className}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={
          'w-full cursor-pointer appearance-none rounded-lg border px-3 py-1.5 pr-8 text-xs font-medium transition-all duration-200 focus:outline-none focus:ring-4 disabled:cursor-not-allowed ' +
          (dark
            ? 'border-slate-700 bg-slate-800 text-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20 disabled:bg-slate-800/50 disabled:text-slate-500'
            : 'border-slate-200 bg-white text-slate-700 focus:border-emerald-500 focus:ring-emerald-500/10 disabled:bg-slate-50 disabled:text-slate-400')
        }
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
    </div>
  )
}
