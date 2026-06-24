import type { ReactNode } from 'react'

// Shared dark "tier" card shell for the Workspace hub (Tier 1/2/3) — keeps the three columns
// visually identical: rounded slate-900 card, emerald section icon, muted uppercase label.
export function TierCard({
  icon,
  label,
  trailing,
  className = '',
  children,
}: {
  icon: ReactNode
  label: string
  trailing?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={'flex min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-900/60 ' + className}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-emerald-400">{icon}</span>
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</h2>
        </div>
        {trailing}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  )
}
