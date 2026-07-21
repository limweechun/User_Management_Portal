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
