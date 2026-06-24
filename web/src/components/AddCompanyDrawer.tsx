import { useState, type ChangeEvent, type FormEvent, type InputHTMLAttributes } from 'react'
import { Drawer } from './Drawer'
import { useToast } from './Toast'
import { iam, type Company } from '../lib/iam'

const EMPTY = { name: '', regNo: '', email: '', phone: '', address: '', city: '', state: '', postcode: '', website: '' }

export function AddCompanyDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (c: Company) => void
}) {
  const { toast } = useToast()
  const [f, setF] = useState({ ...EMPTY })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof EMPTY) => (e: ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.name.trim()) return
    setBusy(true)
    try {
      const c = await iam.createCompany({ ...f, name: f.name.trim() })
      toast('Company created', 'ok')
      setF({ ...EMPTY })
      onCreated(c)
    } catch (err: any) {
      toast(err?.message || 'Could not create company', 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Add new company" side="right" width="max-w-md">
      <form onSubmit={submit} className="space-y-3">
        <Input label="Company name" value={f.name} onChange={set('name')} required autoFocus />
        <Input label="SSM registration no." value={f.regNo} onChange={set('regNo')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Email" type="email" value={f.email} onChange={set('email')} />
          <Input label="Phone" value={f.phone} onChange={set('phone')} />
        </div>
        <Input label="Address" value={f.address} onChange={set('address')} />
        <div className="grid grid-cols-3 gap-3">
          <Input label="City" value={f.city} onChange={set('city')} />
          <Input label="State" value={f.state} onChange={set('state')} />
          <Input label="Postcode" value={f.postcode} onChange={set('postcode')} />
        </div>
        <Input label="Website" value={f.website} onChange={set('website')} />
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition-all duration-200 hover:bg-slate-800/60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 transition-all duration-200 hover:bg-emerald-400 disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Create company'}
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
