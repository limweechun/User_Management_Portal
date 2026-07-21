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
// Bounce guard (loop breaker)
//
// The bounce is only safe if it can't repeat: an app that sends us here on an unrecoverable 401
// (e.g. Procurement's redirectToPortal()) will 401 again the instant we bounce back, and without a
// guard that closes a two-page infinite loop — the browser flickers between the app and the portal
// with no way out.
//
// So: remember the target we just bounced to and refuse to bounce to the SAME target again once the
// traffic looks like a cycle. The refusal falls through to the launcher, which is always a safe
// landing page. Kept in sessionStorage so it dies with the tab, and cleared whenever the user lands
// on the portal deliberately (no ?return) or clicks an app on the launcher — a real navigation is
// never blocked. Every storage failure fails OPEN: we'd rather lose the guard than a deep-link.
//
// Two independent brakes, because a loop can be fast or slow:
//   1. a repeat of the same target inside a short window = visible flicker → refuse at once.
//   2. more than a couple of attempts at the same target inside a long window → refuse however
//      slowly the hops arrive. Counting attempts is time-independent, so a cycle that takes longer
//      than the short window per hop (cold backend spin-up, slow mobile SPA load, a 401 that only
//      fires after a delayed data call) is caught too — the short window alone never stopped those.
const BOUNCE_KEY = 'portal.returnBounce'
const BOUNCE_WINDOW_MS = 15_000
const BOUNCE_ATTEMPT_WINDOW_MS = 5 * 60_000
const MAX_BOUNCE_ATTEMPTS = 3

// key: the coarse identity of the target — origin + pathname, query and fragment dropped. Keying on
// the exact href let any cycle whose URL mutated by a single character (a hash-router app changing
// its route between hops, a nonce in the query) slip past the guard forever. We still redirect to
// the full href; only the bookkeeping is coarse, so a genuinely different app or page bounces freely.
// n: attempts recorded against that key. ts: when the last attempt was ALLOWED.
type BounceRecord = { key: string; ts: number; n: number }

function bounceKeyFor(target: string): string {
  try {
    const u = new URL(target)
    return u.origin + u.pathname
  } catch { return target } // unparseable (shouldn't happen — target is normalized) → key on it as-is
}

function readBounce(): BounceRecord | null {
  try {
    const raw = sessionStorage.getItem(BOUNCE_KEY)
    if (!raw) return null
    const rec = JSON.parse(raw) as Partial<BounceRecord>
    if (typeof rec?.key !== 'string' || typeof rec?.ts !== 'number') return null
    return { key: rec.key, ts: rec.ts, n: typeof rec.n === 'number' && rec.n > 0 ? rec.n : 1 }
  } catch { return null }
}

// Record an allowed attempt. Always returns true: if storage is unavailable we can't guard, but we
// must never break the deep-link.
function writeBounce(rec: BounceRecord): boolean {
  try { sessionStorage.setItem(BOUNCE_KEY, JSON.stringify(rec)) } catch { /* storage unavailable */ }
  return true
}

// Forget the last bounce — target AND attempt count — so the very next attempt to the same target is
// allowed again. Call this on any deliberate navigation: arriving at the portal without a ?return,
// or clicking an app tile.
export function clearBounceGuard(): void {
  try { sessionStorage.removeItem(BOUNCE_KEY) } catch { /* storage unavailable */ }
}

// Claim the right to bounce to `target`. True = go ahead (and the attempt is recorded); false = the
// traffic to this app looks like a cycle, so the caller must fall through to the launcher instead.
// A first attempt always succeeds, including right after a genuine fresh login and in a new tab
// (sessionStorage is per-tab).
export function claimBounce(target: string): boolean {
  const key = bounceKeyFor(target)
  const prev = readBounce()
  const now = Date.now()
  if (prev && prev.key === key) {
    const age = now - prev.ts
    if (age < BOUNCE_ATTEMPT_WINDOW_MS) {
      // Brake 1: it round-tripped within seconds — flicker, refuse now.
      // Brake 2: we've already sent the user to this app MAX times recently and they keep coming
      // back; the hops may be minutes apart (cold start / slow load) but it's still a loop.
      // Either way the record is left untouched — neither refreshed nor incremented — so repeated
      // reloads stay refused until the window elapses from the last ALLOWED attempt.
      if (age < BOUNCE_WINDOW_MS || prev.n >= MAX_BOUNCE_ATTEMPTS) return false
      return writeBounce({ key, ts: now, n: prev.n + 1 })
    }
  }
  // Different app, or the last attempt is ancient → start a fresh count.
  return writeBounce({ key, ts: now, n: 1 })
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
