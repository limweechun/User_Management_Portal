import type { CSSProperties, ReactNode } from 'react'

/**
 * The ONE sign-in screen of the suite (owner ask 2026-10-13: "make them all same look").
 * PSM, Procurement, Admin, Property and Biogas (web) show this exact component for the moments
 * around the portal's login page: taking you to sign-in, signing you in, and any problem (no
 * access, session expired, sign-in unreachable). Same look as the portal's own login (dark navy,
 * green accent). Inline styles only, so it renders identically in every app whatever its CSS.
 * Keep the copies identical: SignInScreen.tsx / sign-in-screen.tsx / SignInScreen.jsx.
 */
export type SignInAction = { label: string; href?: string; onClick?: () => void; primary?: boolean }

export function SignInScreen({
  platformName, appName, busy = false, tone = 'info', title, message, actions = [], children,
}: {
  platformName: string
  appName: string
  /** A spinner instead of an icon: "Taking you to sign-in…", "Signing you in…". */
  busy?: boolean
  /** The icon for a non-busy screen: info (green) or problem (amber). */
  tone?: 'info' | 'problem'
  title: string
  message?: ReactNode
  actions?: SignInAction[]
  /** Extra content inside the card (e.g. PSM's company chooser). */
  children?: ReactNode
}) {
  const C = { bg: '#020617', card: '#0f172a', line: '#1e293b', text: '#f1f5f9', muted: '#94a3b8', green: '#10b981', amber: '#f59e0b' }
  const page: CSSProperties = {
    minHeight: '100vh', width: '100%', boxSizing: 'border-box', display: 'grid', placeItems: 'center', padding: '24px 16px',
    background: `radial-gradient(1200px 600px at 50% -10%, rgba(16,185,129,0.18), transparent 60%), ${C.bg}`,
    color: C.text, fontFamily: "Inter, 'Segoe UI', system-ui, -apple-system, sans-serif",
  }
  const card: CSSProperties = {
    width: '100%', maxWidth: 400, boxSizing: 'border-box', background: C.card, border: `1px solid ${C.line}`, borderRadius: 16,
    padding: '28px 26px 22px', boxShadow: '0 24px 60px rgba(0,0,0,0.45)', textAlign: 'center',
  }
  const btn = (primary?: boolean): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 40, padding: '0 18px', borderRadius: 10,
    fontSize: 14, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', width: '100%', boxSizing: 'border-box',
    border: primary ? 'none' : `1px solid ${C.line}`, background: primary ? C.green : 'transparent', color: primary ? '#022c22' : C.text,
  })
  return (
    <div style={page}>
      <style>{'@keyframes sis-spin{to{transform:rotate(360deg)}}'}</style>
      <div style={card} role={tone === 'problem' && !busy ? 'alert' : 'status'} aria-live="polite">
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span aria-hidden style={{ width: 10, height: 10, flex: 'none', borderRadius: 999, background: C.green, boxShadow: `0 0 0 4px rgba(16,185,129,0.18)` }} />
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.2 }}>{platformName}</span>
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: C.muted }}>{appName}</div>
        </div>
        <div aria-hidden style={{ display: 'grid', placeItems: 'center', marginBottom: 16 }}>
          {busy ? (
            <span style={{ width: 40, height: 40, borderRadius: 999, border: `4px solid ${C.line}`, borderTopColor: C.green, animation: 'sis-spin 0.9s linear infinite' }} />
          ) : (
            <span style={{
              width: 44, height: 44, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 800,
              background: tone === 'problem' ? 'rgba(245,158,11,0.14)' : 'rgba(16,185,129,0.14)', color: tone === 'problem' ? C.amber : C.green,
            }}>{tone === 'problem' ? '!' : '✓'}</span>
          )}
        </div>
        <h1 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 700, lineHeight: 1.3 }}>{title}</h1>
        {message && <div style={{ margin: '0 auto', maxWidth: 320, fontSize: 13.5, lineHeight: 1.55, color: C.muted }}>{message}</div>}
        {children && <div style={{ marginTop: 18, textAlign: 'left' }}>{children}</div>}
        {actions.length > 0 && (
          <div style={{ display: 'grid', gap: 8, marginTop: 20 }}>
            {actions.map((a) => (a.href
              ? <a key={a.label} href={a.href} style={btn(a.primary)}>{a.label}</a>
              : <button key={a.label} type="button" onClick={a.onClick} style={btn(a.primary)}>{a.label}</button>))}
          </div>
        )}
      </div>
      <div style={{ position: 'fixed', bottom: 14, left: 0, right: 0, textAlign: 'center', fontSize: 11, color: '#475569' }}>© {new Date().getFullYear()} {platformName}</div>
    </div>
  )
}
