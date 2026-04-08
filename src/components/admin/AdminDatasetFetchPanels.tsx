import { useState } from 'react'
import {
  runCategoryMonthlyFetch,
  type AdminMonthlyFetchCategory,
} from '../../lib/adminDataStore'
import { ADMIN_FETCH_CATEGORY_META } from '../../lib/adminSourceCategories'

const defaultCategories: AdminMonthlyFetchCategory[] = ['monthly-rents', 'utilities']

export const AdminDatasetFetchPanels = ({
  categories = defaultCategories,
}: {
  categories?: AdminMonthlyFetchCategory[]
}) => {
  const [busy, setBusy] = useState<AdminMonthlyFetchCategory | null>(null)
  const [message, setMessage] = useState<string>('')

  const runFetch = async (category: AdminMonthlyFetchCategory) => {
    setBusy(category)
    setMessage('')

    const result = await runCategoryMonthlyFetch(category)
    setMessage(result.ok ? 'Fetch complete.' : 'Fetch failed.')
    setBusy(null)
  }

  const gridCols =
    categories.length >= 3 ? 'lg:grid-cols-3' : categories.length === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-1'

  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold text-slate-900">Fetch by data category</h3>

      <div className={`grid gap-4 ${gridCols}`}>
        {categories.map((cat) => {
          const meta = ADMIN_FETCH_CATEGORY_META[cat]
          const isBusy = busy === cat
          return (
            <div
              key={cat}
              className="flex flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <h4 className="text-base font-semibold text-slate-900">{meta.title}</h4>
              <p className="mt-1 text-xs text-slate-600">{meta.description}</p>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">Sources</p>
              <ul className="mt-1 max-h-48 list-inside list-disc overflow-y-auto text-xs text-slate-700">
                {meta.sources.map((s) => (
                  <li key={`${cat}-${s.url}`} className="py-0.5">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
                    >
                      {s.name}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex-1" />
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void runFetch(cat)}
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBusy ? 'Fetching…' : 'Fetch new data'}
              </button>
            </div>
          )
        })}
      </div>

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
    </section>
  )
}
