import type { AdminMonthlyFetchCategory } from './adminDataStore'
import { DEFAULT_SOURCES } from './sourcesRegistry'

export type AdminSourceEntry = {
  name: string
  url: string
  notes?: string
}

const uniqByUrl = (entries: AdminSourceEntry[]): AdminSourceEntry[] => {
  const seen = new Set<string>()
  return entries.filter((e) => {
    if (seen.has(e.url)) return false
    seen.add(e.url)
    return true
  })
}

/** CMHC / market rent — drives monthly rent rows from the active dataset. */
export const RENT_MONTHLY_SOURCES: AdminSourceEntry[] = uniqByUrl(
  DEFAULT_SOURCES.filter((s) => ['cmhc-rms-excel', 'statcan-rents'].includes(s.id)).map((s) => ({
    name: s.name,
    url: s.url,
    notes: s.notes,
  })),
)

/** Utility multipliers — StatCan WDS CSV + OEB XML + optional others. */
export const UTILITY_FETCH_SOURCES: AdminSourceEntry[] = uniqByUrl([
  {
    name: 'Statistics Canada — Table 18-10-0001-01 (household heating fuel)',
    url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000101',
  },
  {
    name: 'Statistics Canada — Table 25-10-0059-01 (natural gas)',
    url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2510005901',
  },
  {
    name: 'Statistics Canada — Table 18-10-0204-01 (electricity price index)',
    url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810020401',
  },
  {
    name: 'Ontario Energy Board — BillData.xml (residential electricity)',
    url: 'https://www.oeb.ca/_html/calculator/data/BillData.xml',
  },
  {
    name: 'Hydro-Québec — Opendatasoft API (generation series; CLI audit)',
    url: 'https://donnees.hydroquebec.com/api/explore/v2.1/catalog/datasets/production-electricite-quebec/records',
  },
  {
    name: 'open.canada.ca — CKAN package_show (Alberta energy prices CSV in CLI ingest)',
    url: 'https://open.canada.ca/data/en/api/3/action/package_show?id=6dc97b50-5bbb-482d-8dd5-c9b23cd770dc',
  },
  {
    name: 'OpenEI URDB (optional — OPENEI_API_KEY)',
    url: 'https://api.openei.org/utility_rates',
  },
])

export const ADMIN_FETCH_CATEGORY_META: Record<
  AdminMonthlyFetchCategory,
  { title: string; description: string; sources: AdminSourceEntry[] }
> = {
  'monthly-rents': {
    title: 'Monthly rent rows',
    description:
      'Rebuilds CMHC-based rent history for the last 24 months from the active dataset. Does not change utilities.',
    sources: RENT_MONTHLY_SOURCES,
  },
  utilities: {
    title: 'Utility multipliers',
    description:
      'Rebuilds electricity / natural gas / oil regional factors (Statistics Canada CSV, OEB when available). Does not change rents.',
    sources: UTILITY_FETCH_SOURCES,
  },
}
