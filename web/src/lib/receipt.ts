/**
 * Print a subscription receipt (2026-10-18): fetched from the server and opened as a plain A4 page in
 * a new window, ready to print or save as PDF. The seller is the platform operator's own company
 * (its portal profile: name, numbers, address, logo); the buyer is the customer's company.
 */
type Party = { name?: string; regNo?: string | null; sstNo?: string | null; address?: string | null; address2?: string | null; postcode?: string | null; city?: string | null; state?: string | null; email?: string | null; phone?: string | null; logo?: string | null }
export type Receipt = {
  receiptNo: string; paidAt: string | null; amountSen: number; period: string; billId: string | null
  lines: { label: string; amountSen: number }[]; seller: Party | null; sellerName: string; buyer: Party; platformName: string
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const rm = (sen: number) => 'RM ' + (sen / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const addr = (p: Party) => [p.address, p.address2, [p.postcode, p.city].filter(Boolean).join(' '), p.state].filter(Boolean).join(', ')

export function receiptHtml(r: Receipt): string {
  const s = r.seller || {}
  const date = r.paidAt ? new Date(r.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
  const rows = r.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.label)}</td><td class="r">${rm(l.amountSen)}</td></tr>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(r.receiptNo)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12.5px; margin: 0; }
  .wrap { max-width: 760px; margin: 24px auto; padding: 0 16px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1f6f5c; padding-bottom: 12px; }
  .head img { max-height: 56px; max-width: 160px; }
  .co { font-size: 15px; font-weight: 700; }
  .muted { color: #555; font-size: 11.5px; line-height: 1.5; }
  h1 { font-size: 20px; letter-spacing: 1px; color: #1f6f5c; margin: 18px 0 4px; }
  .meta { display: flex; justify-content: space-between; gap: 24px; margin: 12px 0 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 7px 8px; border-bottom: 1px solid #e4e4e4; text-align: left; vertical-align: top; }
  th { background: #f3f6f5; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
  .r { text-align: right; white-space: nowrap; }
  .tot td { font-weight: 700; border-top: 2px solid #111; border-bottom: 3px double #111; }
  .foot { margin-top: 28px; color: #555; font-size: 11px; }
  .bar { text-align: right; margin: 12px auto 0; max-width: 760px; padding: 0 16px; }
  @media print { .bar { display: none; } .wrap { margin: 0; } }
</style></head><body>
<div class="bar"><button onclick="window.print()">Print / Save as PDF</button></div>
<div class="wrap">
  <div class="head">
    <div><div class="co">${esc(r.sellerName)}</div>
      <div class="muted">${s.regNo ? `Co. No. ${esc(s.regNo)}<br>` : ''}${s.sstNo ? `SST No. ${esc(s.sstNo)}<br>` : ''}${addr(s) ? `${esc(addr(s))}<br>` : ''}${[s.phone, s.email].filter(Boolean).map(esc).join(' · ')}</div></div>
    ${s.logo ? `<img src="${esc(s.logo)}" alt="">` : ''}
  </div>
  <h1>OFFICIAL RECEIPT</h1>
  <div class="meta">
    <div><div class="muted">Received from</div><b>${esc(r.buyer.name)}</b><div class="muted">${r.buyer.regNo ? `${esc(r.buyer.regNo)}<br>` : ''}${esc(addr(r.buyer))}</div></div>
    <div class="muted" style="text-align:right">Receipt no. <b style="color:#111">${esc(r.receiptNo)}</b><br>Date: ${esc(date)}<br>Paid online (Billplz)${r.billId ? `<br>Ref: ${esc(r.billId)}` : ''}</div>
  </div>
  <table><thead><tr><th style="width:36px">No.</th><th>Being payment for</th><th class="r">Amount</th></tr></thead>
    <tbody>${rows}<tr class="tot"><td></td><td>Total received</td><td class="r">${rm(r.amountSen)}</td></tr></tbody></table>
  <div class="foot">Received with thanks. This is a computer-generated receipt; no signature is required.<br>${esc(r.platformName)} subscription · ${r.period === 'year' ? 'yearly' : 'monthly'}</div>
</div></body></html>`
}

/** Open the receipt in a new window. Opened first, filled after the fetch, so pop-up blockers allow it. */
export async function openReceipt(load: () => Promise<Receipt>): Promise<void> {
  const w = window.open('', '_blank')
  if (!w) throw new Error('Allow pop-ups for this site to open the receipt.')
  w.document.write('<p style="font-family:Arial;padding:24px">Loading receipt…</p>')
  try {
    const r = await load()
    w.document.open(); w.document.write(receiptHtml(r)); w.document.close()
  } catch (e: any) {
    w.document.open(); w.document.write(`<p style="font-family:Arial;padding:24px">${esc(e?.message || 'Could not load the receipt.')}</p>`); w.document.close()
  }
}
