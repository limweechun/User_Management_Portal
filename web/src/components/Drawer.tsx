import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

// Overlay drawer with the blueprint's backdrop-blur scrim (Part 3). Slides in from an edge.
export function Drawer({
  open,
  onClose,
  title,
  side = 'right',
  width = 'max-w-md',
  children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  side?: 'left' | 'right'
  width?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const sideCls = side === 'right' ? 'right-0 ' + 'animate-[slideInR_.2s_ease]' : 'left-0 ' + 'animate-[slideInL_.2s_ease]'
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md transition-all duration-200" onClick={onClose} />
      <div className={`absolute top-0 flex h-full w-full ${width} flex-col bg-white shadow-2xl ${sideCls}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div className="min-w-0 text-sm font-medium text-slate-800">{title}</div>
          <button onClick={onClose} className="shrink-0 text-slate-400 transition-colors duration-200 hover:text-slate-600" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
