import { useEffect, useState, type ChangeEvent, type InputHTMLAttributes } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { iam, type CompanyProfile } from '../lib/iam'
import { useToast } from './Toast'

/**
 * Company settings (customer portal, 2026-10-14): the customer's administrator keeps their own
 * company profile — what prints on their invoices, purchase orders and letters: name, numbers,
 * address, contacts, bank account, logo and company chop.
 */
type Field = Exclude<keyof CompanyProfile, 'logo' | 'stamp' | 'companyCode'>
const EMPTY: Record<Field, string> = {
  name: '', regNo: '', sstNo: '', address: '', address2: '', postcode: '', city: '', state: '', country: '', email: '', phone: '',
  faxNo: '', whatsappNo: '', website: '', bankName: '', bankAccountName: '', bankAccountNo: '',
}

export function CompanySettings({ companyId }: { companyId: string }) {
  const { toast } = useToast()
  const [f, setF] = useState({ ...EMPTY })
  const [code, setCode] = useState<string | null>(null)
  const [logo, setLogo] = useState<string | null>(null)
  const [stamp, setStamp] = useState<string | null>(null)
  const [changedImg, setChangedImg] = useState<{ logo?: string | null; stamp?: string | null }>({})
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setLoaded(false)
    iam.companyProfile(companyId).then((c) => {
      setF(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (c as any)[k] || ''])) as Record<Field, string>)
      setCode(c.companyCode || null); setLogo(c.logo || null); setStamp(c.stamp || null); setChangedImg({}); setLoaded(true)
    }).catch((e) => { toast(e?.message || 'Could not load the company profile', 'bad') })
  }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: Field) => (e: ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }))
  const pick = (what: 'logo' | 'stamp') => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) { toast('Use a PNG, JPG, WEBP or GIF image', 'bad'); return }
    if (file.size > 1_000_000) { toast('The image must be under about 1 MB', 'bad'); return }
    const r = new FileReader()
    r.onload = () => {
      const d = String(r.result)
      if (what === 'logo') setLogo(d); else setStamp(d)
      setChangedImg((c) => ({ ...c, [what]: d }))
    }
    r.readAsDataURL(file)
  }
  const clear = (what: 'logo' | 'stamp') => { if (what === 'logo') setLogo(null); else setStamp(null); setChangedImg((c) => ({ ...c, [what]: '' })) }

  const save = async () => {
    if (!f.name.trim()) { toast('Company name is required', 'bad'); return }
    setBusy(true)
    try {
      await iam.saveCompanyProfile(companyId, { ...f, ...changedImg } as any)
      setChangedImg({})
      toast('Company settings saved', 'ok')
    } catch (e: any) { toast(e?.message || 'Could not save', 'bad') } finally { setBusy(false) }
  }

  const imgBox = (what: 'logo' | 'stamp', title: string, hint: string, cur: string | null) => (
    <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">{title}</div>
      <div className="flex items-center gap-3">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
          {cur ? <img src={cur} alt={title} className="h-full w-full object-contain" /> : <span className="text-[9px] text-slate-600">None</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800/60">
            <ImagePlus className="h-3.5 w-3.5" /> {cur ? 'Replace' : 'Upload'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={pick(what)} className="hidden" />
          </label>
          {cur ? <button type="button" onClick={() => clear(what)} className="inline-flex items-center gap-1.5 text-[11px] text-rose-400 hover:text-rose-300"><Trash2 className="h-3 w-3" /> Remove</button> : null}
        </div>
      </div>
      <div className="mt-2 text-[10px] text-slate-500">{hint}</div>
    </div>
  )

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4">
        <div className="text-sm font-medium text-slate-100">Company settings{code ? <span className="ml-2 text-[11px] font-normal text-slate-500">{code}</span> : null}</div>
        <div className="text-[11px] text-slate-500">What prints on your invoices, purchase orders and letters.</div>
      </div>
      {!loaded ? <div className="text-xs text-slate-500">Loading…</div> : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {imgBox('logo', 'Company logo', 'Shown on your document letterheads. PNG/JPG under ~1 MB.', logo)}
            {imgBox('stamp', 'Company stamp (chop)', 'A transparent PNG works best — it is placed over the signature area.', stamp)}
          </div>
          <Input label="Company name" value={f.name} onChange={set('name')} required />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="SSM registration no." value={f.regNo} onChange={set('regNo')} />
            <Input label="SST registration no." value={f.sstNo} onChange={set('sstNo')} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Address line 1" value={f.address} onChange={set('address')} />
            <Input label="Address line 2" value={f.address2} onChange={set('address2')} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Input label="City" value={f.city} onChange={set('city')} />
            <Input label="State" value={f.state} onChange={set('state')} />
            <Input label="Country" value={f.country} onChange={set('country')} />
            <Input label="Postcode" value={f.postcode} onChange={set('postcode')} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Email" type="email" value={f.email} onChange={set('email')} />
            <Input label="Phone" value={f.phone} onChange={set('phone')} />
            <Input label="WhatsApp" value={f.whatsappNo} onChange={set('whatsappNo')} />
            <Input label="Fax" value={f.faxNo} onChange={set('faxNo')} />
          </div>
          <Input label="Website" value={f.website} onChange={set('website')} />
          <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">Bank account (for payments to your company)</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Bank" value={f.bankName} onChange={set('bankName')} placeholder="e.g. Public Bank Berhad" />
              <Input label="Account no." value={f.bankAccountNo} onChange={set('bankAccountNo')} />
            </div>
            <div className="mt-3"><Input label="Account holder name" value={f.bankAccountName} onChange={set('bankAccountName')} /></div>
          </div>
          <div className="flex justify-end">
            <button type="button" disabled={busy} onClick={save} className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60">{busy ? 'Saving…' : 'Save settings'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Input({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <input {...props} className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/20" />
    </label>
  )
}
