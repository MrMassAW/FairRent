import type { SourceReference } from '../types/adminData'

/** Canonical federal + cross-reference URLs (seed + Sources page). */
export const DEFAULT_SOURCES: SourceReference[] = [
  {
    id: 'cmhc-rms-excel',
    name: 'CMHC RMS National Excel (2025)',
    url: 'https://assets.cmhc-schl.gc.ca/sites/cmhc/professional/housing-markets-data-and-research/housing-data-tables/rental-market/rental-market-report-data-tables/2025/rmr-canada-2025-en.xlsx',
    cadence: 'annual',
    category: 'federal',
    notes: 'National Excel download; year in path updates with each RMS release (automation scripts).',
  },
  {
    id: 'statcan-rents',
    name: 'Statistics Canada — rent tables (CSV)',
    url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=4610009201',
    cadence: 'quarterly',
    category: 'federal',
    notes:
      'Rent series used by the admin pipeline (CSV via WDS): annual companion (34-10-0133-01) and quarterly asking rents (46-10-0092-01).',
  },
]

/** Listing import fetches HTML via Jina Reader (see listingAgent.ts). */
export const JINA_READER_SERVICE = {
  id: 'jina-reader',
  name: 'Jina Reader',
  url: 'https://r.jina.ai/',
  notes: 'Third-party HTTP proxy used to retrieve listing pages as text for client-side parsing. Requests use https://r.jina.ai/http/{listing-url}.',
} as const

/**
 * Official statistics for calibrating regional utility multipliers (app currently uses seeded factors in code).
 * @see regionalUtilityFactors.ts
 */
export const STATCAN_ENERGY_SUBJECT = {
  id: 'statcan-energy',
  name: 'Statistics Canada — Energy subject hub',
  url: 'https://www.statcan.gc.ca/en/subjects-start/energy',
  notes: 'Reference for future alignment of provincial electricity/gas/oil multipliers with published indices.',
} as const

/** Every URL that should respond for transparency / CI checks (deduped). */
export function getAllVerificationUrls(): string[] {
  const urls = new Set<string>()
  for (const s of DEFAULT_SOURCES) {
    urls.add(s.url)
  }
  return [...urls].sort((a, b) => a.localeCompare(b))
}
