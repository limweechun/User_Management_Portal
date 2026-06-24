export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-all duration-200 disabled:opacity-50 ' +
        (checked ? 'bg-emerald-500' : 'bg-slate-200')
      }
    >
      <span
        className={
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-all duration-200 ' +
          (checked ? 'translate-x-4' : 'translate-x-0.5')
        }
      />
    </button>
  )
}
