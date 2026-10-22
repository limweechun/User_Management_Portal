import { useEffect, useState } from 'react'

/**
 * The platform's own name (SaaS stage 1, 2026-10-12): the same portal serves the owner's
 * "True Eco Digital Platform" and the SaaS copy, so the name comes from the IAM deployment's
 * public /platform (its PLATFORM_NAME), never from this code. Fetched once per page load.
 */
let cached: string | null = null
let pending: Promise<string> | null = null
/** SaaS stage 3: does this deployment let visitors sign up their own company (with a trial)? */
export type SelfSignup = { on: boolean; trialDays: number }
let signup: SelfSignup = { on: false, trialDays: 14 }
/** Which site this address is: the subscription site (superlisting.net) or the staff portal. */
export type Site = 'account' | 'portal'
let site: Site = 'portal'
/** Published Terms/Privacy version (LEGAL_VERSION on the server); null = not published yet. */
let legal: string | null = null

function load(): Promise<string> {
  if (cached != null) return Promise.resolve(cached)
  if (!pending) {
    pending = fetch('/api/v1/platform', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        signup = { on: d?.selfSignup === true, trialDays: Number(d?.trialDays) || 14 }
        site = d?.site === 'account' ? 'account' : 'portal'
        legal = typeof d?.legal === 'string' && d.legal ? d.legal : null
        return (cached = typeof d?.name === 'string' ? d.name : '')
      })
      .catch(() => (cached = ''))
  }
  return pending
}

/** 'account' on the subscription site, else 'portal'; null until known (so nothing flashes). */
export function useSite(): Site | null {
  const [s, setS] = useState<Site | null>(cached != null ? site : null)
  useEffect(() => {
    let live = true
    load().then(() => { if (live) setS(site) })
    return () => { live = false }
  }, [])
  return s
}

/** The published Terms/Privacy version, or null while they are not published (no links, no tick). */
export function useLegal(): string | null {
  const [v, setV] = useState<string | null>(legal)
  useEffect(() => {
    let live = true
    load().then(() => { if (live) setV(legal) })
    return () => { live = false }
  }, [])
  return v
}

/** Self sign-up settings; off until /platform says otherwise. */
export function useSelfSignup(): SelfSignup {
  const [s, setS] = useState<SelfSignup>(signup)
  useEffect(() => {
    let live = true
    load().then(() => { if (live) setS(signup) })
    return () => { live = false }
  }, [])
  return s
}

/** The platform name, '' until it has loaded (so no other brand ever flashes up). */
export function usePlatformName(): string {
  const [name, setName] = useState(cached ?? '')
  useEffect(() => {
    let live = true
    load().then((n) => { if (live) setName(n) })
    return () => { live = false }
  }, [])
  return name
}
