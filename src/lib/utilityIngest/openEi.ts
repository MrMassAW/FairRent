import type { CanonicalUtilityRow } from './schemas'

export const fetchOpenEiUtilityRatesIfKey = async (
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<CanonicalUtilityRow[] | null> => {
  if (!apiKey?.trim()) return null
  const url = new URL('https://api.openei.org/utility_rates')
  url.searchParams.set('version', 'latest')
  url.searchParams.set('format', 'json')
  url.searchParams.set('address', 'Toronto, ON, Canada')
  url.searchParams.set('api_key', apiKey.trim())
  const res = await fetchImpl(url.toString())
  if (!res.ok) {
    throw new Error(`OpenEI utility_rates: HTTP ${res.status}`)
  }
  const json = (await res.json()) as { items?: unknown[] }
  const items = json.items ?? []
  return [
    {
      source_provider: 'OpenEI (URDB)',
      utility_type: 'mixed',
      region: 'CA',
      effective_date: new Date().toISOString().slice(0, 10),
      unit_cost_cad: null,
      fixed_monthly_fee: null,
      currency: 'CAD',
      unit_of_measure: `tariff_items_count=${items.length}`,
      notes: 'Sample query for Toronto; expand with postal codes for production.',
    },
  ]
}
