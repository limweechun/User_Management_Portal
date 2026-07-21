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

// Was a ?return param PRESENT at all? Deliberately distinct from readReturnParam()/resolveReturnTarget(),
// which both return null for two very different situations: "the user just came to the portal normally"
// and "an app did send us a deep-link but we can't use it" (malformed, non-http(s), not on the origin
// allowlist, or — the transient one — a registered cross-origin target rejected only because listApps()
// threw mid-loop). Callers must not treat the second as a deliberate plain visit: doing so cleared the
// bounce guard and left ?return in the address bar, so one flaky catalog fetch zeroed the loop counter
// AND left the page primed to re-fire the bounce on reload.
export function hasReturnParam(): boolean {
  try { return new URLSearchParams(location.search).has('return') } catch { return false }
}

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
// Three independent brakes, because the two jobs here need different notions of "the same thing" and
// a loop can be fast, slow, or evasive:
//
//   Brake 1 — fast flicker, keyed on the FULL normalized href. A genuine flicker loop re-presents the
//   IDENTICAL href every hop, because the app bounces us with its own current location; so the full
//   href is the right key and it can never punish a different deep-link. (Keying this brake on
//   origin+pathname was a real regression: the only ?return producer in the suite is Procurement,
//   which is a hash router mounted at a constant '/procure/' pathname — every distinct deep-link
//   collapsed to one key, so clicking #/pr/9 seconds after #/invoices/5 was refused as a "loop".)
//
//   Brake 2 — attempt ceiling, keyed on the COARSE identity (origin + pathname), because that is what
//   names the looping APP rather than one document inside it. Counting is time-independent, so a
//   cycle slower than the flicker window (cold backend spin-up, slow mobile SPA load, a 401 that only
//   fires after a delayed data call) is caught too. Records live in a small bounded LRU map, not a
//   single slot: with one slot, hops alternating between two apps each overwrote the other's record
//   and reset it to n=1, so an alternating loop ran forever. Quiet time DECAYS the count (one
//   forgiven per BOUNCE_DECAY_MS) instead of resetting it, so a persistent slow cycle still converges
//   on a refusal while an occasional legitimate bounce hours apart never accumulates.
//
//   Brake 3 — a per-tab ceiling on total allowed bounces that NO KEY CHANGE can reset. This is the
//   backstop for evasive shapes the per-key map can't see: more distinct targets than the map holds,
//   or a cycle pitched exactly at the decay rate. Switching targets buys nothing; only quiet time
//   (same decay as Brake 2, so a long working session can't accumulate a false lockout) and
//   clearBounceGuard() — a deliberate landing or an app-tile click — bring it down.
const BOUNCE_KEY = 'portal.returnBounce'
const BOUNCE_WINDOW_MS = 15_000           // Brake 1: identical href again within this = flicker
const BOUNCE_DECAY_MS = 30 * 60_000       // Brake 2: one recorded attempt forgiven per this much quiet
const MAX_BOUNCE_ATTEMPTS = 3             // Brake 2: refuse the 4th live attempt at one app
const MAX_BOUNCE_RECORDS = 4              // Brake 2: bounded LRU — cap the storage we keep
const MAX_TAB_BOUNCES = 10                // Brake 3: total allowed bounces per tab

// key:  coarse app identity — origin + pathname (query and fragment dropped).
// href: the FULL normalized href of the last ALLOWED bounce to that app, and hts when it happened.
// ts:   when the last attempt to that app was ALLOWED (the decay clock).
// n:    attempts recorded against that app.
type BounceEntry = { key: string; href: string; hts: number; ts: number; n: number }
// apps is most-recent-first and bounded to MAX_BOUNCE_RECORDS.
// total: per-tab allowed-bounce count; tts: when the last bounce (to any target) was allowed.
type BounceState = { v: 3; apps: BounceEntry[]; total: number; tts: number }

const EMPTY_STATE: BounceState = { v: 3, apps: [], total: 0, tts: 0 }

// How many recorded events survive `age` of quiet: one forgiven per BOUNCE_DECAY_MS. Decaying rather
// than resetting is what makes a slow cycle converge on a refusal while a long, legitimate working
// session — occasional bounces spread over hours — never accumulates into a false lockout.
function decay(n: number, age: number): number {
  return Math.max(0, n - Math.floor(Math.max(0, age) / BOUNCE_DECAY_MS))
}

function bounceKeyFor(target: string): string {
  try {
    const u = new URL(target)
    return u.origin + u.pathname
  } catch { return target } // unparseable (shouldn't happen — target is normalized) → key on it as-is
}

// Any unreadable / corrupt / older-version payload degrades to the empty state, which allows the next
// bounce. Failing open is deliberate: losing the guard is far better than losing a real deep-link.
function readBounce(): BounceState {
  try {
    const raw = sessionStorage.getItem(BOUNCE_KEY)
    if (!raw) return EMPTY_STATE
    const st = JSON.parse(raw) as Partial<BounceState>
    if (st?.v !== 3 || !Array.isArray(st.apps)) return EMPTY_STATE
    const apps: BounceEntry[] = []
    for (const e of st.apps as Partial<BounceEntry>[]) {
      if (typeof e?.key !== 'string' || typeof e?.ts !== 'number') continue
      apps.push({
        key: e.key,
        href: typeof e.href === 'string' ? e.href : '',
        hts: typeof e.hts === 'number' ? e.hts : e.ts,
        ts: e.ts,
        n: typeof e.n === 'number' && e.n > 0 ? e.n : 1,
      })
      if (apps.length >= MAX_BOUNCE_RECORDS) break
    }
    const total = typeof st.total === 'number' && st.total > 0 ? st.total : apps.length
    const tts = typeof st.tts === 'number' ? st.tts : (apps[0]?.ts ?? 0)
    return { v: 3, apps, total, tts }
  } catch { return EMPTY_STATE }
}

// Record an allowed attempt. Always returns true: if storage is unavailable we can't guard, but we
// must never break the deep-link.
function writeBounce(st: BounceState): boolean {
  try { sessionStorage.setItem(BOUNCE_KEY, JSON.stringify(st)) } catch { /* storage unavailable */ }
  return true
}

// Forget every bounce — all per-app records AND the per-tab total — so the very next attempt to any
// target is allowed again. Call this ONLY on a genuinely deliberate navigation: arriving at the portal
// with no ?return at all, or clicking an app tile. Notably NOT when a ?return was present but could
// not be used: that is a hop in a possible loop, not a fresh start.
export function clearBounceGuard(): void {
  try { sessionStorage.removeItem(BOUNCE_KEY) } catch { /* storage unavailable */ }
}

// Claim the right to bounce to `target`. True = go ahead (and the attempt is recorded); false = the
// traffic to this app looks like a cycle, so the caller must fall through to the launcher instead.
// A first attempt always succeeds, including right after a genuine fresh login and in a new tab
// (sessionStorage is per-tab). A refusal leaves the stored state untouched — neither refreshed nor
// incremented — so repeated reloads stay refused rather than re-arming the guard.
export function claimBounce(target: string): boolean {
  const href = target
  const key = bounceKeyFor(target)
  const now = Date.now()
  const st = readBounce()
  const prev = st.apps.find(e => e.key === key) ?? null

  let n = 1
  if (prev) {
    // Brake 1 — the exact same href, again, within seconds: that's the flicker signature.
    if (prev.href === href && now - prev.hts < BOUNCE_WINDOW_MS) return false
    // Brake 2 — attempts at this app, decayed by however long it has been quiet.
    const attempts = decay(prev.n, now - prev.ts)
    if (attempts >= MAX_BOUNCE_ATTEMPTS) return false
    n = attempts + 1
  }
  // Brake 3 — per-tab ceiling; switching targets cannot buy more hops.
  const total = decay(st.total, now - st.tts)
  if (total >= MAX_TAB_BOUNCES) return false

  const entry: BounceEntry = { key, href, hts: now, ts: now, n }
  const apps = [entry, ...st.apps.filter(e => e.key !== key)].slice(0, MAX_BOUNCE_RECORDS)
  return writeBounce({ v: 3, apps, total: total + 1, tts: now })
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
