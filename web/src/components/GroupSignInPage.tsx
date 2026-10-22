import { useEffect, useState, type ChangeEvent } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { iam, type GroupPage } from '../lib/iam'
import { useToast } from './Toast'

/**
 * The group's own sign-in page (owner ask 2026-10-22): the address the team signs in at
 * (superlisting.net/<code>) and its cover — name, message, logo, up to 10 rotating photos —
 * designed by the customer's administrator, the way the owner designs their own login page.
 * Renders nothing for a company that is not part of a customer group.
 */
const MAX_PHOTOS = 10
const CARD = 'rounded-2xl border border-slate-800 bg-slate-900 p-5'
const INPUT = 'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none'

export function GroupSignInPage({ companyId }: { companyId: string }) {
  const { toast } = useToast()
  const [g, setG] = useState<GroupPage | null | undefined>(undefined)
  const [companyName, setCompanyName] = useState('')
  const [message, setMessage] = useState('')
  const [logo, setLogo] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    iam.myGroup(companyId).then((r) => {
      setG(r); setCompanyName(r.branding.companyName || ''); setMessage(r.branding.message || '')
      setLogo(r.branding.logoDataUrl || ''); setPhotos(r.branding.photoDataUrls || [])
    }).catch(() => setG(null))
  }, [companyId])

  if (!g) return null
  const link = `${location.host}/${g.code}`

  const readImage = (file: File): Promise<string | null> => {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) { toast('Use a PNG, JPG, WEBP or GIF image', 'bad'); return Promise.resolve(null) }
    if (file.size > 1_000_000) { toast('Each image must be under ~1 MB', 'bad'); return Promise.resolve(null) }
    return new Promise((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => { toast('Could not read that image', 'bad'); resolve(null) }
      r.readAsDataURL(file)
    })
  }
  const onLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (f) { const d = await readImage(f); if (d) setLogo(d) }
  }
  const onPhotos = async (e: ChangeEvent<HTMLInputElement>) => {
    // Array.from first: the FileList is live, and the value reset below empties it.
    const files = Array.from(e.target.files || []); e.target.value = ''
    let landed = photos.length
    for (const f of files) {
      if (landed >= MAX_PHOTOS) { toast(`Up to ${MAX_PHOTOS} photos — extra files were skipped.`, 'bad'); break }
      const d = await readImage(f)
      if (!d) continue
      landed += 1
      setPhotos((p) => (p.length >= MAX_PHOTOS ? p : [...p, d]))
    }
  }
  const save = async () => {
    setSaving(true)
    try {
      await iam.saveGroup(companyId, { companyName: companyName.trim(), message: message.trim(), logoDataUrl: logo, photoDataUrls: photos })
      toast('Sign-in page saved', 'ok')
    } catch (e: any) {
      toast(e?.message || 'Could not save', 'bad')
    } finally { setSaving(false) }
  }

  return (
    <div className={CARD + ' mt-4'}>
      <div className="text-sm font-medium text-slate-100">Group sign-in page · {g.name}</div>
      <p className="mt-1 text-xs text-slate-400">Your team signs in here. Share this address with them; it is the same for every company in your group.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a href={`/${g.code}`} target="_blank" rel="noopener" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">{link}</a>
        <button type="button" onClick={() => { navigator.clipboard?.writeText(`https://${link}`).then(() => toast('Link copied', 'ok')).catch(() => {}) }}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800"><Copy className="h-3.5 w-3.5" /> Copy</button>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-400">Name on the page
          <input className={INPUT + ' mt-1'} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={g.name} maxLength={120} />
        </label>
        <label className="text-xs text-slate-400">Message
          <input className={INPUT + ' mt-1'} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Welcome back! Sign in to continue." maxLength={300} />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-700 bg-slate-800/40">
          {logo ? <img src={logo} alt="Logo" className="h-full w-full object-contain" /> : <span className="text-[9px] text-slate-600">No logo</span>}
        </div>
        <label className="cursor-pointer rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
          {logo ? 'Replace logo' : 'Upload logo'}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onLogo} className="hidden" />
        </label>
        {logo ? <button type="button" onClick={() => setLogo('')} className="text-[11px] text-rose-400 hover:text-rose-300">Remove</button> : null}
      </div>

      <div className="mt-4">
        <div className="text-xs text-slate-400">Photos (rotate on the sign-in page)</div>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {photos.map((src, i) => (
            <div key={i} className="group relative h-16 w-24 overflow-hidden rounded-lg border border-slate-700">
              <img src={src} alt="" className="h-full w-full object-cover" />
              <button type="button" onClick={() => setPhotos((p) => p.filter((_, x) => x !== i))} aria-label="Remove photo"
                className="absolute right-1 top-1 rounded bg-slate-900/80 p-0.5 text-rose-300 opacity-0 transition-opacity group-hover:opacity-100"><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS ? (
            <label className="grid h-16 w-24 cursor-pointer place-items-center rounded-lg border border-dashed border-slate-700 text-[11px] text-slate-500 hover:border-emerald-500 hover:text-emerald-300">
              + Add
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={onPhotos} className="hidden" />
            </label>
          ) : null}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">PNG/JPG/WEBP/GIF, under ~1 MB each, up to {MAX_PHOTOS}.</p>
      </div>

      <div className="mt-4">
        <button onClick={save} disabled={saving} className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save sign-in page'}
        </button>
      </div>
    </div>
  )
}
