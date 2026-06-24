import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

export type ToastKind = 'ok' | 'bad' | 'info'
interface ToastItem { id: number; msg: string; kind: ToastKind }
interface ToastApi { toast: (msg: string, kind?: ToastKind) => void }

const Ctx = createContext<ToastApi>({ toast: () => {} })
export const useToast = () => useContext(Ctx)

let _id = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const toast = useCallback((msg: string, kind: ToastKind = 'info') => {
    const id = ++_id
    setItems((s) => [...s, { id, msg, kind }])
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 2600)
  }, [])

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[120] flex -translate-x-1/2 flex-col items-center gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={
              'rounded-lg px-4 py-2 text-xs font-medium shadow-lg ring-1 transition-all duration-200 ' +
              (t.kind === 'bad'
                ? 'bg-rose-600 text-white ring-rose-700/20'
                : t.kind === 'ok'
                  ? 'bg-emerald-600 text-white ring-emerald-700/20'
                  : 'bg-slate-900 text-white ring-black/10')
            }
          >
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
