export type GeocodeResult = {
  query: string
  ok: boolean
  lat?: number
  lng?: number
  accuracyType?: string
  accuracyScore?: number
  formattedAddress?: string
  error?: string
}

const GEOCODIO_API_KEY = import.meta.env.VITE_GEOCODIO_API_KEY as string | undefined

/** In dev, use Vite proxy to avoid browser CORS to api.geocod.io. Production uses HTTPS API directly. */
const geocodioBaseUrl = (): string =>
  import.meta.env.DEV ? `${typeof window !== 'undefined' ? window.location.origin : ''}/geocodio` : 'https://api.geocod.io'

export const isGeocodioConfigured = (): boolean => Boolean(GEOCODIO_API_KEY && GEOCODIO_API_KEY.trim().length > 0)

type GeocodioLocation = { lat: number; lng: number }
type GeocodioResponseItem = {
  input: { formatted_address?: string } | string
  error?: string
  results?: Array<{
    formatted_address?: string
    location?: GeocodioLocation
    accuracy?: number
    accuracy_type?: string
  }>
}

type GeocodioWrappedBatchResponse = {
  results: Array<{
    query?: string
    response?: GeocodioResponseItem
  }>
}

const pickFirstResult = (item: GeocodioResponseItem): Omit<GeocodeResult, 'query'> => {
  if (item.error) return { ok: false, error: item.error }
  const r = item.results?.[0]
  const loc = r?.location
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
    return { ok: false, error: 'No geocode result.' }
  }
  return {
    ok: true,
    lat: loc.lat,
    lng: loc.lng,
    accuracyType: r?.accuracy_type,
    accuracyScore: r?.accuracy,
    formattedAddress: r?.formatted_address,
  }
}

/**
 * Batch forward geocode using Geocodio.\n
 * Free tier supports up to 2,500 lookups/day; keep batches small and dedupe inputs.\n
 * Docs: https://www.geocod.io/
 */
export const geocodeBatchGeocodio = async (queries: string[]): Promise<GeocodeResult[]> => {
  const key = GEOCODIO_API_KEY?.trim() ?? ''
  if (!key) {
    return queries.map((query) => ({ query, ok: false, error: 'Missing VITE_GEOCODIO_API_KEY' }))
  }
  const cleaned = queries.map((q) => q.trim())
  const url = `${geocodioBaseUrl()}/v1.12/geocode`
  let resp: Response
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(cleaned),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error'
    return cleaned.map((query) => ({
      query,
      ok: false,
      error: `Geocodio request failed (${msg}). If this is a CORS error, run the app via Vite dev server (npm run dev) or add a server proxy.`,
    }))
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    return cleaned.map((query) => ({
      query,
      ok: false,
      error: `Geocodio HTTP ${resp.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
    }))
  }
  const payload = (await resp.json()) as unknown
  let items: GeocodioResponseItem[] | null = null

  if (Array.isArray(payload)) {
    items = payload as GeocodioResponseItem[]
  } else if (payload && typeof payload === 'object' && Array.isArray((payload as GeocodioWrappedBatchResponse).results)) {
    const wrapped = (payload as GeocodioWrappedBatchResponse).results
    const byQuery = new Map<string, GeocodioResponseItem>()
    for (const w of wrapped) {
      if (typeof w?.query === 'string' && w.response && typeof w.response === 'object') byQuery.set(w.query, w.response)
    }
    // Preserve caller order; if a query is missing in the wrapped payload, return a per-query error.
    return cleaned.map((query) => {
      const r = byQuery.get(query)
      return r ? { query, ...pickFirstResult(r) } : { query, ok: false, error: 'No geocode result.' }
    })
  }

  if (!items || items.length !== cleaned.length) {
    return cleaned.map((query) => ({ query, ok: false, error: 'Unexpected geocoder response shape.' }))
  }
  return items.map((item, idx) => ({ query: cleaned[idx], ...pickFirstResult(item) }))
}

export const chunked = <T,>(values: T[], chunkSize: number): T[][] => {
  const size = Math.max(1, Math.floor(chunkSize))
  const out: T[][] = []
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size))
  return out
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

