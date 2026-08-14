import { iam, type App, type Me } from './iam'

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
// Bounce guard (flicker breaker)
//
// The bounce is only safe if it can't flicker: an app that sends us here on an unrecoverable 401
// (e.g. Procurement's redirectToPortal()) will 401 again the instant we bounce back, and without a
// guard that closes a two-page loop — the browser ping-pongs between the app and the portal with no
// way out.
//
// ONE brake, keyed on the FULL normalized href: if we are asked to bounce to the exact same href we
// just bounced to, within seconds, that is the flicker signature and we refuse. It is the correct
// key because a genuine loop always re-presents the IDENTICAL href — the 401ing app re-emits its own
// current location — and it therefore can never punish a DIFFERENT deep-link. The refusal falls
// through to the launcher, which is always a safe landing page.
//
// Kept in sessionStorage so it dies with the tab, and cleared whenever the user lands on the portal
// deliberately (no ?return) or clicks an app on the launcher. Every storage failure fails OPEN: we'd
// rather lose the guard than a deep-link.
//
// This used to carry two more brakes: a coarse attempt counter keyed on origin+pathname, and a
// per-tab ceiling on total bounces (with an LRU map and a decay clock behind them). Both are gone,
// and deliberately deleted rather than disabled. They punished the wrong thing: the only ?return
// producer in the suite is Procurement, a HASH ROUTER whose pathname is the constant '/procure/', so
// the coarse key collapsed every distinct document to one target — a user opening their 4th document
// in half an hour was dumped on the launcher. They also shared one decay constant, so they shared a
// blind spot and did not reliably catch the slow loops that were their entire reason to exist.
// A slow loop (an app that 401s more slowly than the window below) will now bounce repeatedly; see
// the note on claimBounce() for why that is an acceptable trade.
const BOUNCE_KEY = 'portal.returnBounce'
const BOUNCE_WINDOW_MS = 15_000           // identical href again within this = flicker

// href: the FULL normalized href of the last ALLOWED bounce; ts: when it was allowed.
type BounceState = { v: 4; href: string; ts: number }

const EMPTY_STATE: BounceState = { v: 4, href: '', ts: 0 }

// Any unreadable / corrupt / older-version payload degrades to the empty state, which ALLOWS the next
// bounce. Failing open is deliberate: losing the guard is far better than losing a real deep-link.
// Note there is nothing left that can fail closed — the empty href matches no real target, and a
// target is always a non-empty normalized absolute URL.
function readBounce(): BounceState {
  try {
    const raw = sessionStorage.getItem(BOUNCE_KEY)
    if (!raw) return EMPTY_STATE
    const st = JSON.parse(raw) as Partial<BounceState>
    if (st?.v !== 4 || typeof st.href !== 'string' || typeof st.ts !== 'number') return EMPTY_STATE
    return { v: 4, href: st.href, ts: st.ts }
  } catch { return EMPTY_STATE }
}

// Record an allowed attempt. Always returns true: if storage is unavailable we can't guard, but we
// must never break the deep-link.
function writeBounce(st: BounceState): boolean {
  try { sessionStorage.setItem(BOUNCE_KEY, JSON.stringify(st)) } catch { /* storage unavailable */ }
  return true
}

// Forget the recorded bounce, so the very next attempt to any target is allowed again. Call this ONLY
// on a genuinely deliberate navigation: arriving at the portal with no ?return at all, or clicking an
// app tile. Notably NOT when a ?return was present but could not be used: that is a hop in a possible
// loop, not a fresh start.
export function clearBounceGuard(): void {
  try { sessionStorage.removeItem(BOUNCE_KEY) } catch { /* storage unavailable */ }
}

// Claim the right to bounce to `target`. True = go ahead (and the bounce is recorded); false = this
// is the identical href we just bounced to, so the caller must fall through to the launcher instead.
// A first attempt always succeeds, including right after a genuine fresh login and in a new tab
// (sessionStorage is per-tab), and ANY different href always succeeds. A refusal leaves the stored
// state untouched — not refreshed — so a reload inside the window stays refused rather than re-arming.
//
// What this deliberately does NOT stop: a loop slower than BOUNCE_WINDOW_MS, which will keep bouncing.
// Accepted, because the cost is bounded and the alternative was worse: the user always reaches the
// launcher (the refusal path strips ?return, so the landing is idempotent), no such slow loop has
// ever been observed in production — the machinery for it was added pre-emptively — and the brakes
// that chased it were provably refusing real users' deep-links every day.
export function claimBounce(target: string): boolean {
  const now = Date.now()
  const prev = readBounce()
  // The exact same href, again, within seconds: that's the flicker signature.
  if (prev.href === target && now - prev.ts < BOUNCE_WINDOW_MS) return false
  return writeBounce({ v: 4, href: target, ts: now })
}

// ---------------------------------------------------------------------------
// App token handoff (?redirect_uri=<app callback>&state=<nonce>)
//
// PSM-style apps run their own backend session: their login page sends a signed-out user
// here naming the callback it wants back on (e.g. /psjags01/auth/callback) plus an
// anti-CSRF state. Until 2026-08-14 the portal IGNORED these params — an already-authed
// user just got the launcher again and had to find the app's tile by hand (the owner's
// "why do I click multiple times to reach PSM"). Now the portal finishes the trip: mint
// that app's access token and land on the callback with #token=...&state=... — the same
// fragment shape the launcher's own tile handoff uses, and fragments never reach servers
// or logs.
//
// Guards, because a token must never be handed to an address an attacker chose:
//   1. protocol must be http(s);
//   2. the callback's first path segment must be a REGISTERED app's id (that is the app
//      whose token is minted), the app must be live (and not in maintenance for
//      non-supers), and the user must actually hold a company on it;
//   3. the callback's origin must be our own or that registered app's own catalog origin;
//   4. any attacker-supplied fragment is discarded — the token becomes THE fragment.
// Every failure returns null and the caller lands on the launcher, exactly as before.

export function hasHandoffParam(): boolean {
  try { return new URLSearchParams(location.search).has('redirect_uri') } catch { return false }
}

export async function resolveHandoffTarget(me: Me, isSuper: boolean): Promise<string | null> {
  let raw = ''
  let state = ''
  try {
    const p = new URLSearchParams(location.search)
    raw = p.get('redirect_uri') || ''
    state = p.get('state') || ''
  } catch { return null }
  if (!raw) return null
  let u: URL
  try { u = new URL(raw, location.origin) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  u.hash = ''
  const appId = u.pathname.replace(/^\/+/, '').split('/')[0] || ''
  const companyId = me.apps?.[appId]?.companies?.[0]?.companyId
  if (!appId || !companyId) return null
  // Catalog checks fail CLOSED: no catalog, no token handoff.
  let apps: App[]
  try { apps = await iam.listApps() } catch { return null }
  const app = apps.find((a) => a.id === appId)
  if (!app || app.active === false) return null
  if (app.maintenanceMode && !isSuper) return null
  if (u.origin !== location.origin && !allowedOrigins(apps).has(u.origin)) return null
  try {
    const r = await iam.appAccessToken(appId, companyId)
    return `${u.href}#token=${encodeURIComponent(r.accessToken)}${state ? `&state=${encodeURIComponent(state)}` : ''}`
  } catch { return null }
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
