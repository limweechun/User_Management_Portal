import { useState, type ReactNode } from 'react'
import termsEn from '../../../docs/legal/terms-of-service.md?raw'
import termsMs from '../../../docs/legal/terma-perkhidmatan.md?raw'
import privacyEn from '../../../docs/legal/privacy-notice.md?raw'
import privacyMs from '../../../docs/legal/notis-privasi.md?raw'
import { usePlatformName } from '../lib/platform'

/**
 * Terms of Service + Privacy Notice (2026-10-22), opened as /?legal=terms or /?legal=privacy.
 * The text is the reviewed Markdown in docs/legal/ — one source for the lawyer, the repo and the
 * page — in English or Bahasa Malaysia. Linked from the subscription site only once LEGAL_VERSION
 * is set on the server (see useLegal).
 */
export type LegalPage = 'terms' | 'privacy'
const DOCS: Record<LegalPage, { en: string; ms: string }> = {
  terms: { en: termsEn, ms: termsMs },
  privacy: { en: privacyEn, ms: privacyMs },
}

/** The four inline forms the documents use: **bold**, plain text, nothing else. */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i} className="text-slate-100">{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>)
}

/** Minimal Markdown → JSX for these documents: # / ## headings, "- " bullets (two-space nested), paragraphs. */
export function renderLegal(md: string): ReactNode[] {
  const out: ReactNode[] = []
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    if (line.startsWith('# ')) { out.push(<h1 key={i} className="mb-4 text-2xl font-semibold text-slate-50">{inline(line.slice(2))}</h1>); i++; continue }
    if (line.startsWith('## ')) { out.push(<h2 key={i} className="mb-2 mt-7 text-base font-semibold text-slate-100">{inline(line.slice(3))}</h2>); i++; continue }
    if (/^\s*- /.test(line)) {
      const items: { depth: number; text: string }[] = []
      while (i < lines.length && /^\s*- /.test(lines[i])) {
        const m = lines[i].match(/^(\s*)- (.*)$/)!
        items.push({ depth: m[1].length >= 2 ? 1 : 0, text: m[2] }); i++
      }
      out.push(
        <ul key={`ul${i}`} className="mb-3 space-y-1">
          {items.map((it, k) => (
            <li key={k} className={'flex gap-2 ' + (it.depth ? 'pl-6' : '')}><span className="text-emerald-400">•</span><span>{inline(it.text)}</span></li>
          ))}
        </ul>
      )
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#|\s*- )/.test(lines[i])) { para.push(lines[i].trim()); i++ }
    out.push(<p key={`p${i}`} className="mb-3">{inline(para.join(' '))}</p>)
  }
  return out
}

export function Legal({ page }: { page: LegalPage }) {
  const platformName = usePlatformName()
  const [lang, setLang] = useState<'en' | 'ms'>(() => (navigator.language || '').toLowerCase().startsWith('ms') ? 'ms' : 'en')
  const other: LegalPage = page === 'terms' ? 'privacy' : 'terms'
  const label = (p: LegalPage) => (lang === 'ms' ? (p === 'terms' ? 'Terma Perkhidmatan' : 'Notis Privasi') : (p === 'terms' ? 'Terms of Service' : 'Privacy Notice'))
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300">
      <header className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-4">
        <a href="/" className="text-sm font-semibold text-slate-200 hover:text-white">← {platformName || 'Home'}</a>
        <div className="flex items-center gap-3 text-xs">
          <a href={`/?legal=${other}`} className="text-emerald-300 hover:underline">{label(other)}</a>
          <div role="group" aria-label="Language" className="inline-flex overflow-hidden rounded-full border border-slate-700">
            {(['en', 'ms'] as const).map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
                className={'px-2.5 py-1 font-semibold ' + (lang === l ? 'bg-emerald-500 text-slate-950' : 'text-slate-300')}>
                {l === 'en' ? 'EN' : 'BM'}
              </button>
            ))}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16 text-sm leading-relaxed">{renderLegal(DOCS[page][lang])}</main>
    </div>
  )
}
