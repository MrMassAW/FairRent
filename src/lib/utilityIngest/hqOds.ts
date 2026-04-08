import type { CanonicalUtilityRow } from './schemas'

export type HqProductionRecord = {
  date: string
  valeurs_total: number
}

export const HQ_PRODUCTION_DATASET_URL =
  'https://donnees.hydroquebec.com/api/explore/v2.1/catalog/datasets/production-electricite-quebec/records'

/** Fetch Hydro-Québec ODS production series (MWh — not retail $/kWh). */
export const fetchHqProductionElectricity = async (
  fetchImpl: typeof fetch = fetch,
  limit = 100,
): Promise<HqProductionRecord[]> => {
  const url = new URL(HQ_PRODUCTION_DATASET_URL)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('order_by', 'date')
  const res = await fetchImpl(url.toString())
  if (!res.ok) {
    throw new Error(`Hydro-Québec ODS: HTTP ${res.status}`)
  }
  const json = (await res.json()) as { results?: HqProductionRecord[] }
  return json.results ?? []
}

export const toCanonicalHqProductionRows = (records: HqProductionRecord[]): CanonicalUtilityRow[] =>
  records.map((r) => ({
    source_provider: 'Hydro-Québec',
    utility_type: 'electricity',
    region: 'QC',
    effective_date: r.date.slice(0, 10),
    unit_cost_cad: r.valeurs_total,
    fixed_monthly_fee: null,
    currency: 'CAD' as const,
    unit_of_measure: 'MWh_provincial_generation',
    notes: 'Provincial generation (valeurs_total), not residential tariff.',
  }))
