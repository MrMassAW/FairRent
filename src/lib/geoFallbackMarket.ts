import type { GeoDistanceReductionPolicy, RentByCmaMonthly } from '../types/adminData'
import { getAvailableHistoryMonths, getGeoDistanceReductionPolicy, getRentsForMonth } from './adminDataStore'
import { geocodeBatchGeocodio, isGeocodioConfigured } from './geocode'
import { haversineKm, stepwiseFactorForKm } from './geoDistance'

export type GeoFallbackMarketResult = {
  ok: boolean
  reason?: string
  selected: {
    province: string
    cma: string
    bedrooms: number
    baseRent: number
    distanceKm: number
    factor: number
    adjustedRent: number
    month: string
  }
  policy: GeoDistanceReductionPolicy
}

const hasCoords = (r: Pick<RentByCmaMonthly, 'lat' | 'lng'>): r is { lat: number; lng: number } =>
  typeof r.lat === 'number' && Number.isFinite(r.lat) && typeof r.lng === 'number' && Number.isFinite(r.lng)

/** Geocodio + monthly `RentByCmaMonthly` anchors (admin pipeline). Used after Canada places + bundled CMHC coords. */
export const buildGeoFallbackMarketRent = async (input: {
  province: string
  city: string
  bedrooms: number
}): Promise<GeoFallbackMarketResult | null> => {
  const policy = await getGeoDistanceReductionPolicy()
  if (!policy.enabled) return null
  if (!isGeocodioConfigured()) return null

  const province = input.province.trim().toUpperCase()
  const city = input.city.trim()
  if (!province || !city) return null

  const months = await getAvailableHistoryMonths()
  const latestMonth = months[0]
  if (!latestMonth) return null

  const rows = await getRentsForMonth(latestMonth)
  const candidates = rows.filter((r) => r.province.toUpperCase() === province && r.bedrooms === input.bedrooms && hasCoords(r))
  if (candidates.length === 0) return null

  const q = `${city}, ${province}, Canada`
  const [geo] = await geocodeBatchGeocodio([q])
  if (!geo || !geo.ok || geo.lat === undefined || geo.lng === undefined) return null

  let best: { row: RentByCmaMonthly; km: number } | null = null
  for (const r of candidates) {
    const km = haversineKm({ lat: geo.lat, lng: geo.lng }, { lat: r.lat!, lng: r.lng! })
    if (!best || km < best.km) best = { row: r, km }
  }
  if (!best) return null

  const maxSearchKm = policy.maxSearchKm
  if (typeof maxSearchKm === 'number' && Number.isFinite(maxSearchKm) && best.km > maxSearchKm) {
    return null
  }

  const factor = stepwiseFactorForKm(best.km, policy.bandsKm, policy.floorFactor)
  const baseRent = Math.max(0, best.row.avgRent)
  const adjustedRent = Math.round(baseRent * factor)

  return {
    ok: true,
    selected: {
      province: best.row.province,
      cma: best.row.cma,
      bedrooms: best.row.bedrooms,
      baseRent,
      distanceKm: best.km,
      factor,
      adjustedRent,
      month: latestMonth,
    },
    policy,
  }
}

