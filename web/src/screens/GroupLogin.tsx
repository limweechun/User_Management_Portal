import { useEffect, useState } from 'react'
import { iam, type GroupPage } from '../lib/iam'
import { Login } from './Login'
import { rememberGroup } from './AccountLanding'

/**
 * A customer group's own sign-in page (owner ask 2026-10-22): superlisting.net/<group code>, with
 * the group's name and cover. Visiting it remembers the group on this device, so the front page's
 * "Sign in" offers to come straight back here.
 */
export function GroupLogin({ code, initialNotice, onAuthed }: { code: string; initialNotice?: string; onAuthed: () => void }) {
  const [group, setGroup] = useState<GroupPage | null | undefined>(undefined)
  useEffect(() => {
    iam.groupPage(code)
      .then((g) => { setGroup(g); rememberGroup(g.code); document.title = `${g.name} · Sign in` })
      .catch(() => setGroup(null))
  }, [code])

  if (group === undefined) return <div className="min-h-screen bg-slate-950" />
  if (group === null) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 p-6 text-center text-slate-300">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">No group called “{code}”</h1>
          <p className="mt-2 text-xs text-slate-400">Check the address, or ask your administrator for your group's sign-in link.</p>
          <a href="/" className="mt-5 inline-block rounded-lg border border-slate-700 px-4 py-2 text-xs text-emerald-300 hover:bg-slate-800">Go to the home page</a>
        </div>
      </div>
    )
  }
  return <Login group={group} initialNotice={initialNotice} onAuthed={onAuthed} />
}
