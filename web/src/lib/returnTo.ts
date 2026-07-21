import { iam, type App } from './iam'

// SSO deep-link return. An app can send a signed-out user to the portal to authenticate with
// ?return=<deep-link>; once authed we bounce them straight back to the linked document instead
// of dead-ending on the launcher. Ported from the legacy app.js:85 returnTarget().
//
// Two guards keep this from becoming an open redirect:
//   1. protocol must be http(s) — no javascript:, data:, etc.
//   2. the resolved origin must be same-origin OR a registered app's origin (the allowlist the
//      legacy TODO asked for). The legacy check stopped at (1), so `?return=//evil.com` slipped
//      through (protocol resolves to https); the origin allowlist below closes that.

// Parse ?return and apply the protocol guard. Returns the normalized absolute href, or null when
// absent/malformed/non-http(s). Relative targets resolve against our own origin (path-mounted apps).
export function readReturnParam(): string | null {
  const p = new URLSearchParams(location.search).get('return')
  if (!p) return null
  try {
    const u = new URL(p, location.origin)
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href
  } catch { /* malformed URL — ignore */ }
  return null
}

// Origins we're willing to bounce back to: our own origin (covers every path-mounted app behind
// the single-origin gateway, e.g. /psom01/pr/123) plus the origin of each registered app whose
// catalog URL is absolute http(s).
function allowedOrigins(apps: App[]): Set<string> {
  const set = new Set<string>([location.origin])
  for (const a of apps) {
    if (!a.url) continue
    try {
      const u = new URL(a.url, location.origin)
      if (u.protocol === 'http:' || u.protocol === 'https:') set.add(u.origin)
    } catch { /* skip a bad catalog url */ }
  }
  return set
}

// ---------------------------------------------------------------------------
// One-shot bounce guard (loop breaker)
//
// The bounce is only safe if it can't repeat: an app that sends us here on an unrecoverable 401
// (e.g. Procurement's redirectToPortal()) will 401 again the instant we bounce back, and without a
// guard that closes a two-page infinite loop — the browser flickers between the app and the portal
// with no way out.
//
// So: remember the target we just bounced to and refuse to bounce to the SAME target again inside a
// short window. The refusal falls through to the launcher, which is always a safe landing page.
// Kept in sessionStorage so it dies with the tab, and cleared whenever the user lands on the portal
// deliberately (no ?return) or clicks an app on the launcher — a real navigation is never blocked.
const BOUNCE_KEY = 'portal.returnBounce'
const BOUNCE_WINDOW_MS = 15_000

type BounceRecord = { href: string; ts: number }

function readBounce(): BounceRecord | null {
  try {
    const raw = sessionStorage.getItem(BOUNCE_KEY)
    if (!raw) return null
    const rec = JSON.parse(raw) as BounceRecord
    if (typeof rec?.href !== 'string' || typeof rec?.ts !== 'number') return null
    return rec
  } catch { return null }
}

// Forget the last bounce, so the very next attempt to the same target is allowed again. Call this on
// any deliberate navigation: arriving at the portal without a ?return, or clicking an app tile.
export function clearBounceGuard(): void {
  try { sessionStorage.removeItem(BOUNCE_KEY) } catch { /* storage unavailable */ }
}

// Claim the right to bounce to `target`. True = go ahead (and the attempt is recorded); false = we
// already sent the user here moments ago and they came straight back, so this is a loop — the
// caller must fall through to the launcher instead. A first attempt always succeeds, including
// right after a genuine fresh login.
export function claimBounce(target: string): boolean {
  const prev = readBounce()
  // Same target, still inside the window → the bounce round-tripped: refuse. The record is left in
  // place (not refreshed) so repeated reloads of this URL stay refused until the window elapses.
  if (prev && prev.href === target && Date.now() - prev.ts < BOUNCE_WINDOW_MS) return false
  try {
    sessionStorage.setItem(BOUNCE_KEY, JSON.stringify({ href: target, ts: Date.now() } satisfies BounceRecord))
  } catch { /* storage unavailable — can't guard, but don't break the deep-link */ }
  return true
}

// Resolve + validate the ?return target against the app-URL allowlist. Returns the safe absolute
// href to redirect to, or null when there's no return param or it fails a guard. Only called once
// the user is authenticated, so listApps() (same endpoint the launcher uses) is available.
export async function resolveReturnTarget(): Promise<string | null> {
  const target = readReturnParam()
  if (!target) return null
  let origin: string
  try { origin = new URL(target).origin } catch { return null }
  // Same-origin stays on our own domain — never an open-redirect risk, and no catalog needed.
  if (origin === location.origin) return target
  // Cross-origin: only allow it if it matches a registered app. If the catalog can't be fetched,
  // fail closed and reject rather than risk bouncing to an unverified external origin.
  try {
    const apps = await iam.listApps()
    if (allowedOrigins(apps).has(origin)) return target
  } catch { /* catalog unavailable — reject cross-origin */ }
  return null
}
