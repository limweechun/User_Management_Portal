import { useEffect, useState, type ChangeEvent, type FormEvent, type InputHTMLAttributes } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { Drawer } from './Drawer'
import { useToast } from './Toast'
import { StyledSelect } from './StyledSelect'
import { iam, type Company } from '../lib/iam'

const EMPTY_FORM = {
  name: '', regNo: '', email: '', phone: '', address: '', address2: '', city: '', state: '', postcode: '',
  website: '', epfNo: '', socsoNo: '', eisNo: '', incomeTaxNo: '',
}
type FieldKey = keyof typeof EMPTY_FORM

function fromCompany(c: Company): typeof EMPTY_FORM {
  return {
    name: c.name || '', regNo: c.regNo || '', email: c.email || '', phone: c.phone || '',
    address: c.address || '', address2: c.address2 || '', city: c.city || '', state: c.state || '',
    postcode: c.postcode || '', website: c.website || '',
    epfNo: c.epfNo || '', socsoNo: c.socsoNo || '', eisNo: c.eisNo || '', incomeTaxNo: c.incomeTaxNo || '',
  }
}

// ONE drawer for both registering a new company and editing an existing one — the form is
// identical, only create vs PATCH on submit differs. company === null ⇒ create mode.
// Logo (base64 data-URL, <1 MB) feeds document letterheads across apps.
export function CompanyDrawer({
  open,
  company,
  onClose,
  onSaved,
}: {
  open: boolean
  company: Company | null
  onClose: () => void
  onSaved: (c: Company, isNew: boolean) => void
}) {
  const isEdit = !!company
  const { toast } = useToast()
  const [f, setF] = useState({ ...EMPTY_FORM })
  const [status, setStatus] = useState<'active' | 'inactive'>('active')
  const [logo, setLogo] = useState<string | undefined>(undefined) // undefined = unchanged, '' = clear, data-URL = new
  const [curLogo, setCurLogo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    if (company) { setF(fromCompany(company)); setStatus(company.status || 'active'); setCurLogo(company.logo ?? null) }
    else { setF({ ...EMPTY_FORM }); setStatus('active'); setCurLogo(null) }
    setLogo(undefined)
  }, [open, company])

  const set = (k: FieldKey) => (e: ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }))

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) { toast('Use a PNG, JPG, WEBP or GIF image', 'bad'); return }
    if (file.size > 1_000_000) { toast('Logo image must be under ~1 MB', 'bad'); return }
    const reader = new FileReader()
    reader.onload = () => { const d = String(reader.result); setLogo(d); setCurLogo(d) }
    reader.onerror = () => toast('Could not read that image', 'bad')
    reader.readAsDataURL(file)
  }
  const clearLogo = () => { setLogo(''); setCurLogo(null) }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.name.trim()) { toast('Company name is required', 'bad'); return }
    setBusy(true)
    try {
      const payload: Partial<Company> = { ...f, name: f.name.trim(), status }
      if (logo !== undefined) payload.logo = logo // '' clears server-side, data-URL sets it
      const saved = isEdit
        ? ({ ...company, ...((await iam.updateCompany(company!.id, payload)) as Company) } as Company)
        : await iam.createCompany(payload)
      toast(isEdit ? 'Company profile saved' : 'Company created', 'ok')
      onSaved(saved, !isEdit)
    } catch (err: any) {
      toast(err?.message || (isEdit ? 'Could not save company' : 'Could not create company'), 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title={isEdit ? 'Company profile · ' + company!.name : 'Register new company'} side="right" width="max-w-md">
      <form onSubmit={submit} className="space-y-3">
        <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">Company logo</div>
          <div className="flex items-center gap-3">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
              {curLogo ? <img src={curLogo} alt="Company logo" className="h-full w-full object-contain" /> : <span className="text-[9px] text-slate-600">No logo</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition-all duration-200 hover:bg-slate-800/60">
                <ImagePlus className="h-3.5 w-3.5" /> {curLogo ? 'Replace' : 'Upload'}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onFile} className="hidden" />
              </label>
              {curLogo ? (
                <button type="button" onClick={clearLogo} className="inline-flex items-center gap-1.5 text-[11px] text-rose-400 transition-colors duration-200 hover:text-rose-300">
                  <Trash2 className="h-3 w-3" /> Remove logo
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-2 text-[10px] text-slate-500">PNG/JPG/WEBP/GIF, under ~1 MB. Shown on document letterheads.</div>
        </div>

        <Input label="Company name" value={f.name} onChange={set('name')} required autoFocus={!isEdit} />
        <Input label="SSM registration no." value={f.regNo} onChange={set('regNo')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Email" type="email" value={f.email} onChange={set('email')} />
          <Input label="Phone" value={f.phone} onChange={set('phone')} />
        </div>
        <Input label="Address line 1" value={f.address} onChange={set('address')} />
        <Input label="Address line 2" value={f.address2} onChange={set('address2')} />
        <div className="grid grid-cols-3 gap-3">
          <Input label="City" value={f.city} onChange={set('city')} />
          <Input label="State" value={f.state} onChange={set('state')} />
          <Input label="Postcode" value={f.postcode} onChange={set('postcode')} />
        </div>
        <Input label="Website" value={f.website} onChange={set('website')} />

        <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">Employer statutory numbers</div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="EPF no." value={f.epfNo} onChange={set('epfNo')} />
            <Input label="SOCSO no." value={f.socsoNo} onChange={set('socsoNo')} />
            <Input label="EIS no." value={f.eisNo} onChange={set('eisNo')} />
            <Input label="Income tax no." value={f.incomeTaxNo} onChange={set('incomeTaxNo')} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Status</span>
          <StyledSelect tone="dark" value={status} onChange={(v) => setStatus(v as 'active' | 'inactive')} className="w-36">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </StyledSelect>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition-all duration-200 hover:bg-slate-800/60">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 transition-all duration-200 hover:bg-emerald-400 disabled:opacity-60">
            {busy ? 'Saving…' : isEdit ? 'Save profile' : 'Create company'}
          </button>
        </div>
      </form>
    </Drawer>
  )
}

function Input({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <input
        {...props}
        className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 transition-all duration-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/20"
      />
    </label>
  )
}
