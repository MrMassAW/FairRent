import type { CanadaPlacesDataset } from '../types/canadaPlaces'
import type { CanadaProvinceOption } from './canadaProvincesFallback'

const GEO_FETCH_TIMEOUT_MS = 30_000

const geoApiBaseUrl = (): string | undefined => {
  const geo = import.meta.env.VITE_GEO_API_URL
  if (typeof geo === 'string' && geo.trim()) return geo.trim().replace(/\/$/, '')
  const agent = import.meta.env.VITE_LISTING_AGENT_URL
  if (typeof agent === 'string' && agent.trim()) return agent.trim().replace(/\/$/, '')
  return undefined
}

const cityCache = new Map<string, string[]>()
let provincesCache: CanadaProvinceOption[] | null = null

export type PlacesProvincePayload = {
  province: string
  municipalities: CanadaPlacesDataset['municipalities']
  fsas: CanadaPlacesDataset['fsas']
}

const placesProvinceCache = new Map<string, PlacesProvincePayload>()
let placesStaticFull: CanadaPlacesDataset | null | undefined

const fetchJson = async <T>(path: string): Promise<T> => {
  const base = geoApiBaseUrl()
  if (!base) {
    throw new Error('No geo API base URL (set VITE_LISTING_AGENT_URL or VITE_GEO_API_URL)')
  }
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), GEO_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${base}${path}`, { signal: controller.signal })
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`)
    }
    return (await res.json()) as T
  } finally {
    window.clearTimeout(timer)
  }
}

export const isCanadaGeoApiConfigured = (): boolean => Boolean(geoApiBaseUrl())

/** Clears caches (e.g. after tests). */
export const clearCanadaGeoCache = (): void => {
  cityCache.clear()
  provincesCache = null
  placesProvinceCache.clear()
  placesStaticFull = undefined
}

export async function fetchCanadaProvinces(): Promise<CanadaProvinceOption[]> {
  if (provincesCache) return provincesCache
  const list = await fetchJson<CanadaProvinceOption[]>('/geo/provinces')
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('Invalid /geo/provinces response')
  }
  provincesCache = list
  return list
}

export async function fetchCitiesForProvince(provinceCode: string): Promise<string[]> {
  const code = provinceCode.trim().toUpperCase()
  const hit = cityCache.get(code)
  if (hit) return hit

  const data = await fetchJson<{ province?: string; cities?: string[] }>(
    `/geo/cities?province=${encodeURIComponent(code)}`,
  )
  const cities = Array.isArray(data.cities) ? data.cities : []
  cityCache.set(code, cities)
  return cities
}

async function loadCanadaPlacesStaticFull(): Promise<CanadaPlacesDataset | null> {
  if (placesStaticFull !== undefined) return placesStaticFull
  try {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), GEO_FETCH_TIMEOUT_MS)
    try {
      const res = await fetch('/data/canadaPlaces.json', { signal: controller.signal })
      if (!res.ok) {
        placesStaticFull = null
        return null
      }
      placesStaticFull = (await res.json()) as CanadaPlacesDataset
      return placesStaticFull
    } finally {
      window.clearTimeout(timer)
    }
  } catch {
    placesStaticFull = null
    return null
  }
}

/**
 * Municipalities + FSAs for one province. Uses listing/geo API when configured, otherwise `/data/canadaPlaces.json`.
 */
export async function fetchPlacesForProvince(provinceCode: string): Promise<PlacesProvincePayload | null> {
  const province = provinceCode.trim().toUpperCase()
  const cached = placesProvinceCache.get(province)
  if (cached) return cached

  const base = geoApiBaseUrl()
  if (base) {
    try {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), GEO_FETCH_TIMEOUT_MS)
      try {
        const res = await fetch(`${base}/geo/places?province=${encodeURIComponent(province)}`, {
          signal: controller.signal,
        })
        if (res.ok) {
          const data = (await res.json()) as PlacesProvincePayload
          if (data.province && Array.isArray(data.municipalities) && Array.isArray(data.fsas)) {
            placesProvinceCache.set(province, data)
            return data
          }
        }
      } finally {
        window.clearTimeout(timer)
      }
    } catch {
      /* fall through to static */
    }
  }

  const full = await loadCanadaPlacesStaticFull()
  if (!full) return null
  const payload: PlacesProvincePayload = {
    province,
    municipalities: full.municipalities.filter((m) => m.province === province),
    fsas: full.fsas.filter((f) => f.province === province),
  }
  placesProvinceCache.set(province, payload)
  return payload
}
