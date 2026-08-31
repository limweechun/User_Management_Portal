import { useEffect, useState, type ChangeEvent, type FormEvent, type InputHTMLAttributes } from 'react'
import { ImagePlus, ShieldAlert, Trash2, X } from 'lucide-react'
import { useToast } from './Toast'
import { iam, type Company } from '../lib/iam'

const EMPTY_FORM = {
  name: '', regNo: '', sstNo: '', email: '', phone: '', faxNo: '', whatsappNo: '', address: '', address2: '', city: '', state: '', postcode: '',
  website: '', epfNo: '', socsoNo: '', eisNo: '', incomeTaxNo: '',
}
type FieldKey = keyof typeof EMPTY_FORM

function fromCompany(c: Company): typeof EMPTY_FORM {
  return {
    name: c.name || '', regNo: c.regNo || '', sstNo: c.sstNo || '', email: c.email || '', phone: c.phone || '',
    faxNo: c.faxNo || '', whatsappNo: c.whatsappNo || '',
    address: c.address || '', address2: c.address2 || '', city: c.city || '', state: c.state || '',
    postcode: c.postcode || '', website: c.website || '',
    epfNo: c.epfNo || '', socsoNo: c.socsoNo || '', eisNo: c.eisNo || '', incomeTaxNo: c.incomeTaxNo || '',
  }
}

// ONE centered modal for both registering a new company and editing an existing one — the form
// is identical, only create vs PATCH on submit differs. company === null ⇒ create mode.
// Closes on ESC, backdrop click, or Cancel. Logo (base64 data-URL, <1 MB) feeds letterheads.
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
  // The company stamp (chop). Same three-state convention as the logo.
  const [stamp, setStamp] = useState<string | undefined>(undefined)
  const [curStamp, setCurStamp] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false) // showing the deletion-request form
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!open) return
    if (company) {
      setF(fromCompany(company)); setStatus(company.status || 'active')
      setCurLogo(company.logo ?? null); setCurStamp(company.stamp ?? null)
    } else {
      setF({ ...EMPTY_FORM }); setStatus('active'); setCurLogo(null); setCurStamp(null)
    }
    setLogo(undefined); setStamp(undefined); setDeleting(false); setReason('')
  }, [open, company])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const set = (k: FieldKey) => (e: ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }))

  /** One picker for both images — the logo and the stamp differ only in where the result goes. */
  const pickImage = (what: 'logo' | 'stamp') => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) { toast('Use a PNG, JPG, WEBP or GIF image', 'bad'); return }
    if (file.size > 1_000_000) { toast(`${what === 'logo' ? 'Logo' : 'Stamp'} image must be under ~1 MB`, 'bad'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const d = String(reader.result)
      if (what === 'logo') { setLogo(d); setCurLogo(d) } else { setStamp(d); setCurStamp(d) }
    }
    reader.onerror = () => toast('Could not read that image', 'bad')
    reader.readAsDataURL(file)
  }
  const onFile = pickImage('logo')
  const clearLogo = () => { setLogo(''); setCurLogo(null) }
  const clearStamp = () => { setStamp(''); setCurStamp(null) }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.name.trim()) { toast('Company name is required', 'bad'); return }
    setBusy(true)
    try {
      // Profile only — status changes go through the deletion request / reactivate.
      const payload: Partial<Company> = { ...f, name: f.name.trim() }
      if (logo !== undefined) payload.logo = logo // '' clears server-side, data-URL sets it
      if (stamp !== undefined) payload.stamp = stamp
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

  // File a deletion (retire) request — needs two admin approvals before it takes effect.
  const fileDeletion = async () => {
    setBusy(true)
    try {
      await iam.requestCompanyDeletion(company!.id, reason.trim() || undefined)
      toast('Deletion request filed — it needs two admin approvals', 'ok')
      setDeleting(false); setReason(''); onClose()
    } catch (err: any) {
      toast(err?.message || 'Could not file the deletion request', 'bad')
    } finally { setBusy(false) }
  }

  // Reactivating an inactive company is a direct action (not gated).
  const reactivate = async () => {
    setBusy(true)
    try {
      const updated = { ...company, ...((await iam.updateCompany(company!.id, { status: 'active' })) as Company) } as Company
      toast('Company reactivated', 'ok')
      onSaved(updated, false)
    } catch (err: any) {
      toast(err?.message || 'Could not reactivate the company', 'bad')
    } finally { setBusy(false) }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md transition-all duration-200" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-[784px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl animate-[popIn_.18s_ease]">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="min-w-0 truncate text-sm font-medium text-slate-100">{isEdit ? 'Company profile · ' + company!.name : 'Register new company'}</div>
          <button onClick={onClose} className="shrink-0 text-slate-400 transition-colors duration-200 hover:text-slate-200" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="scrollbar-transparent min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

            <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
              <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">Company stamp (chop)</div>
              <div className="flex items-center gap-3">
                <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
                  {curStamp ? <img src={curStamp} alt="Company stamp" className="h-full w-full object-contain" /> : <span className="text-[9px] text-slate-600">No stamp</span>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition-all duration-200 hover:bg-slate-800/60">
                    <ImagePlus className="h-3.5 w-3.5" /> {curStamp ? 'Replace' : 'Upload'}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={pickImage('stamp')} className="hidden" />
                  </label>
                  {curStamp ? (
                    <button type="button" onClick={clearStamp} className="inline-flex items-center gap-1.5 text-[11px] text-rose-400 transition-colors duration-200 hover:text-rose-300">
                      <Trash2 className="h-3 w-3" /> Remove stamp
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 text-[10px] text-slate-500">
                A transparent PNG works best — it is affixed OVER the signature area, and a white
                box would hide what is underneath. Only users granted the right to affix it can
                put it on a document.
              </div>
            </div>
            </div>

            <Input label="Company name" value={f.name} onChange={set('name')} required autoFocus={!isEdit} />
            <Input label="SSM registration no." value={f.regNo} onChange={set('regNo')} />
            {/* Sits with SSM because they are the same kind of thing — the company's two
                registered numbers. It prints on the letterhead of documents that go out. */}
            <Input label="SST registration no." value={f.sstNo} onChange={set('sstNo')} placeholder="e.g. W24-2311-32100007" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Email" type="email" value={f.email} onChange={set('email')} />
              <Input label="Phone / Hunting Line" value={f.phone} onChange={set('phone')} />
            </div>
            {/* The other two numbers a letterhead carries. Both optional: a company with
                neither simply prints neither. */}
            <div className="grid grid-cols-2 gap-3">
              <Input label="WhatsApp no." value={f.whatsappNo} onChange={set('whatsappNo')} />
              <Input label="Fax no." value={f.faxNo} onChange={set('faxNo')} />
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

            {isEdit && (
              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Status</div>
                    <div className={'mt-0.5 text-xs font-medium ' + (status === 'active' ? 'text-emerald-300' : 'text-slate-400')}>{status === 'active' ? 'Active' : 'Inactive'}</div>
                  </div>
                  {status === 'active' ? (
                    !deleting && (
                      <button type="button" onClick={() => setDeleting(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-medium text-rose-300 transition-all duration-200 hover:bg-rose-500/10">
                        <Trash2 className="h-3.5 w-3.5" /> Delete company…
                      </button>
                    )
                  ) : (
                    <button type="button" disabled={busy} onClick={reactivate} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-all duration-200 hover:bg-emerald-500/10 disabled:opacity-60">
                      Reactivate
                    </button>
                  )}
                </div>
                {deleting && (
                  <div className="mt-3 border-t border-slate-800 pt-3">
                    <div className="mb-2 flex items-start gap-1.5 text-[11px] text-rose-300/90">
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>Retiring needs <strong>one other admin's approval</strong> (two people total). It deactivates the company (reversible) — app data is untouched.</span>
                    </div>
                    <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Reason (optional)"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none focus:ring-4 focus:ring-rose-500/20" />
                    <div className="mt-2 flex justify-end gap-2">
                      <button type="button" onClick={() => { setDeleting(false); setReason('') }} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all duration-200 hover:bg-slate-800/60">Cancel</button>
                      <button type="button" disabled={busy} onClick={fileDeletion} className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-medium text-white transition-all duration-200 hover:bg-rose-400 disabled:opacity-60">{busy ? 'Filing…' : 'Submit deletion request'}</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition-all duration-200 hover:bg-slate-800/60">Cancel</button>
              <button type="submit" disabled={busy} className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 transition-all duration-200 hover:bg-emerald-400 disabled:opacity-60">
                {busy ? 'Saving…' : isEdit ? 'Save profile' : 'Create company'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
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
