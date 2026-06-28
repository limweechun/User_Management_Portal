import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search } from 'lucide-react'
import { APP_ICONS, iconByName } from '../lib/appIcons'

interface Rect {
  left: number
  top: number
  bottom: number
  width: number
}

// Visual icon picker for the Apps Registry form. Stores/returns the kebab-case lucide name,
// so the backend column is unchanged. Renders a searchable grid of the curated APP_ICONS, each
// shown as its real glyph.
//
// The popover is rendered through a portal with FIXED positioning anchored to the trigger, so it
// is never clipped by the surrounding centered-modal's overflow-y-auto body. It flips above the
// trigger when there isn't room below, and repositions on scroll/resize. Closes on outside-click
// or Esc (capture-phase + stopPropagation, so Esc closes the picker before it bubbles up to the
// modal's own Esc-to-close handler).
export function IconSelect({ value, onChange }: { value?: string | null; onChange: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [rect, setRect] = useState<Rect | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const triggerId = useId()
  const Current = iconByName(value)
  const current = value?.trim() || 'box'

  const reposition = () => {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setRect({ left: r.left, top: r.top, bottom: r.bottom, width: r.width })
  }

  const toggle = () => {
    if (!open) reposition()
    setOpen((o) => !o)
  }

  const close = () => {
    setQ('')
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    const onMove = () => reposition()
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true) // capture: catches scrolling of the modal body too
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return APP_ICONS
    return APP_ICONS.filter((i) => i.label.toLowerCase().includes(t) || i.name.includes(t))
  }, [q])

  const pick = (name: string) => {
    onChange(name)
    close()
  }

  // Prefer opening downward; flip up when there isn't room below and there's more room above.
  const PANEL = 296
  const spaceBelow = rect ? window.innerHeight - rect.bottom : 9999
  const openUp = !!rect && spaceBelow < PANEL && rect.top > spaceBelow
  const panelStyle = rect
    ? {
        position: 'fixed' as const,
        left: rect.left,
        width: rect.width,
        ...(openUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
      }
    : { display: 'none' as const }

  return (
    <div ref={wrapRef} className="relative">
      <button
        id={triggerId}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 transition-all duration-200 hover:border-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/20"
      >
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-700/60 text-emerald-300">
          <Current className="h-3.5 w-3.5" />
        </span>
        <span className="flex-1 text-left font-mono text-[11px] text-slate-300">{current}</span>
        <ChevronDown
          className={'h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 ' + (open ? 'rotate-180' : '')}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={popRef}
            role="listbox"
            aria-labelledby={triggerId}
            style={panelStyle}
            className="z-[60] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl animate-[popIn_.14s_ease]"
          >
            <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoFocus
                placeholder="Search icons…"
                className="w-full bg-transparent text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
              />
            </div>
            <div className="scrollbar-transparent grid max-h-56 grid-cols-6 gap-1 overflow-y-auto p-2">
              {filtered.map(({ name, label, Icon }) => {
                const active = name === current
                return (
                  <button
                    key={name}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => pick(name)}
                    title={label}
                    aria-label={label}
                    className={
                      'grid aspect-square place-items-center rounded-lg border transition-all duration-150 ' +
                      (active
                        ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                        : 'border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-800/60 hover:text-slate-200')
                    }
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                )
              })}
              {filtered.length === 0 && (
                <div className="col-span-6 py-4 text-center text-[11px] text-slate-500">No icons match “{q}”.</div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
