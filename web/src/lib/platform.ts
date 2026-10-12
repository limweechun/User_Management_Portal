import { useEffect, useState } from 'react'

/**
 * The platform's own name (SaaS stage 1, 2026-10-12): the same portal serves the owner's
 * "True Eco Digital Platform" and the SaaS copy, so the name comes from the IAM deployment's
 * public /platform (its PLATFORM_NAME), never from this code. Fetched once per page load.
 */
let cached: string | null = null
let pending: Promise<string> | null = null

function load(): Promise<string> {
  if (cached != null) return Promise.resolve(cached)
  if (!pending) {
    pending = fetch('/api/v1/platform', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (cached = typeof d?.name === 'string' ? d.name : ''))
      .catch(() => (cached = ''))
  }
  return pending
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
