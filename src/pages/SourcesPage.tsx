import { Link } from 'react-router-dom'
import {
  DEFAULT_SOURCES,
  JINA_READER_SERVICE,
  STATCAN_ENERGY_SUBJECT,
} from '../lib/sourcesRegistry'

const tocLinkClass =
  'text-brand-700 underline decoration-brand-700/35 underline-offset-2 hover:decoration-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 rounded'

const sectionTitleClass = 'scroll-mt-24 text-xl font-semibold tracking-tight text-slate-900'

const bodyClass = 'max-w-2xl text-base leading-relaxed text-slate-600'

const cadencePlain: Record<string, string> = {
  annual: 'Roughly once a year',
  quarterly: 'Each quarter',
  'as-published': 'When the publisher updates',
  'weekly-check': 'Checked often for new releases',
}

const subsectionTitle: Record<'federal' | 'supplementary' | 'methodology', string> = {
  federal: 'Rent surveys and national statistics',
  supplementary: 'Related data portals',
  methodology: 'Cross-checks and overview links',
}

const groupSources = () => {
  const groups: Record<string, typeof DEFAULT_SOURCES> = {}
  for (const s of DEFAULT_SOURCES) {
    const key = s.category
    if (!groups[key]) groups[key] = []
    groups[key]!.push(s)
  }
  return groups
}

const linkRowClass =
  'flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4'

const externalLinkClass =
  'shrink-0 break-all text-sm font-semibold text-brand-700 underline decoration-brand-700/35 underline-offset-2'

export const SourcesPage = () => {
  const grouped = groupSources()

  return (
    <article className="app-surface space-y-12 p-6 text-slate-700 md:p-8">
      <header className="space-y-4 border-b border-slate-200/80 pb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Sources</h1>
        <div className={`${bodyClass} space-y-4`}>
          <p>
            This page lists the <strong>official and public links</strong> behind FairRent&apos;s data: average rents,
            supporting statistics. Use them to read the original material or to plan updates.
          </p>
          <p>
            For <strong>how numbers are calculated</strong> in the app, see{' '}
            <Link to="/methodology" className={tocLinkClass}>
              Methodology
            </Link>
            .
          </p>
        </div>
      </header>

      <nav
        aria-labelledby="sources-toc-title"
        className="rounded-xl border border-slate-200 bg-slate-50/80 p-5 shadow-sm"
      >
        <h2 id="sources-toc-title" className="text-lg font-semibold text-slate-900">
          On this page
        </h2>
        <ul className="mt-4 space-y-2 text-base">
          <li>
            <a href="#published-data" className={tocLinkClass}>
              1. Published data and statistics
            </a>
          </li>
          <li>
            <a href="#listing-import" className={tocLinkClass}>
              2. Listing import (optional feature)
            </a>
          </li>
          <li>
            <a href="#utility-multipliers" className={tocLinkClass}>
              3. Utility cost multipliers by region
            </a>
          </li>
        </ul>
      </nav>

      <section id="published-data" className="scroll-mt-24 space-y-8">
        <div className="space-y-3">
          <h2 className={sectionTitleClass}>1. Published data and statistics</h2>
          <p className={bodyClass}>
            <strong>CMHC</strong> and <strong>Statistics Canada</strong> are the main sources for average rents and
            related tables. The list below is the same one used to seed the app&apos;s data registry.
          </p>
        </div>

        {(['federal', 'supplementary', 'methodology'] as const).map((cat) => {
          const items = grouped[cat]
          if (!items?.length) return null
          return (
            <div key={cat} className="space-y-3">
              <h3 className="text-lg font-semibold text-slate-900">{subsectionTitle[cat]}</h3>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {items.map((s) => (
                  <li key={s.id} className={linkRowClass}>
                    <div>
                      <div className="font-medium text-slate-900">{s.name}</div>
                      <p className="mt-0.5 text-sm leading-relaxed text-slate-600 md:text-base">{s.notes}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Typical refresh: {cadencePlain[s.cadence] ?? s.cadence}
                      </p>
                    </div>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className={externalLinkClass}>
                      {s.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </section>

      <section id="listing-import" className="scroll-mt-24 space-y-4">
        <h2 className={sectionTitleClass}>2. Listing import (optional feature)</h2>
        <p className={bodyClass}>
          If you use a feature that reads a listing from the web, that step may call an external reader service. The
          link below is the one configured in the app registry.
        </p>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          <li className={linkRowClass}>
            <div>
              <div className="font-medium text-slate-900">{JINA_READER_SERVICE.name}</div>
              <p className="mt-0.5 text-sm leading-relaxed text-slate-600 md:text-base">{JINA_READER_SERVICE.notes}</p>
            </div>
            <a href={JINA_READER_SERVICE.url} target="_blank" rel="noopener noreferrer" className={externalLinkClass}>
              {JINA_READER_SERVICE.url}
            </a>
          </li>
        </ul>
      </section>

      <section id="utility-multipliers" className="scroll-mt-24 space-y-4">
        <h2 className={sectionTitleClass}>3. Utility cost multipliers by region</h2>
        <p className={bodyClass}>
          Default dollar adjustments for electricity, gas, and oil in the calculator are <strong>starting values</strong>{' '}
          in the app. Official energy statistics are the intended basis when those values are reviewed and updated.
        </p>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          <li className={linkRowClass}>
            <div>
              <div className="font-medium text-slate-900">{STATCAN_ENERGY_SUBJECT.name}</div>
              <p className="mt-0.5 text-sm leading-relaxed text-slate-600 md:text-base">{STATCAN_ENERGY_SUBJECT.notes}</p>
            </div>
            <a href={STATCAN_ENERGY_SUBJECT.url} target="_blank" rel="noopener noreferrer" className={externalLinkClass}>
              {STATCAN_ENERGY_SUBJECT.url}
            </a>
          </li>
        </ul>
      </section>

      <section className="scroll-mt-24 border-t border-slate-200 pt-8" aria-label="Developer reference">
        <details className="group rounded-lg border border-slate-200 bg-slate-50/50 p-5">
          <summary className="cursor-pointer text-base font-semibold text-slate-900 marker:text-slate-500 group-open:mb-3">
            For developers
          </summary>
          <p className={`${bodyClass} text-sm`}>
            Source rows are defined in{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">sourcesRegistry.ts</code>.
            Regional utility defaults live in{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">regionalUtilityFactors.ts</code>.
          </p>
        </details>
      </section>
    </article>
  )
}
