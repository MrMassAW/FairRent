import type { CmhcRentRow } from '../data/cmhcRents'
import type { CanadaPlacesDataset } from '../types/canadaPlaces'
import { resolveLatLngFromPlaces } from './canadaPlacesLookup'
import type { PlacesProvincePayload } from './canadaGeoApi'
import { getGeoDistanceReductionPolicy } from './adminDataStore'
import { haversineKm, stepwiseFactorForKm } from './geoDistance'
import {
  isUsableCityMatchForLookup,
  lookupCmhcRent,
  resolveClosestMasterCity,
  type CmhcLookupResult,
} from './cmhcLookup'
import type { CalculatorFormState } from '../types/calculator'
import { effectiveLocationForCmhcLookup } from './buildingTypes'

const normProvCity = (s: string) => s.trim().toLowerCase()

/** Build a minimal {@link CanadaPlacesDataset} slice for lookup helpers. */
export function placesDatasetFromProvincePayload(payload: PlacesProvincePayload): CanadaPlacesDataset {
  return {
    source: 'province-slice',
    generatedNote: '',
    generatedAt: '',
    municipalities: payload.municipalities,
    fsas: payload.fsas,
  }
}

function dedupeAnchorsByCity(dataset: CmhcRentRow[], province: string, bedrooms: number): CmhcRentRow[] {
  const p = normProvCity(province)
  const byCity = new Map<string, CmhcRentRow>()
  for (const row of dataset) {
    if (normProvCity(row.province) !== p) continue
    if (row.bedrooms !== bedrooms) continue
    if (typeof row.lat !== 'number' || !Number.isFinite(row.lat)) continue
    if (typeof row.lng !== 'number' || !Number.isFinite(row.lng)) continue
    const k = normProvCity(row.city)
    if (!byCity.has(k)) byCity.set(k, row)
  }
  return [...byCity.values()]
}

export function findNearestCmhcRentAnchor(
  province: string,
  bedrooms: number,
  lat: number,
  lng: number,
  dataset: CmhcRentRow[],
): { row: CmhcRentRow; km: number } | null {
  const candidates = dedupeAnchorsByCity(dataset, province, bedrooms)
  let best: { row: CmhcRentRow; km: number } | null = null
  for (const row of candidates) {
    const km = haversineKm({ lat, lng }, { lat: row.lat!, lng: row.lng! })
    if (!best || km < best.km) best = { row, km }
  }
  return best
}

export type BundledGeoRentResult =
  | {
      ok: true
      selected: {
        province: string
        city: string
        bedrooms: number
        baseRent: number
        distanceKm: number
        factor: number
        adjustedRent: number
      }
    }
  | { ok: false }

export async function tryBundledGeoMarketRent(input: {
  province: string
  city: string
  bedrooms: number
  dataset: CmhcRentRow[]
  lat: number
  lng: number
}): Promise<BundledGeoRentResult> {
  const policy = await getGeoDistanceReductionPolicy()
  if (!policy.enabled) return { ok: false }

  const best = findNearestCmhcRentAnchor(
    input.province,
    input.bedrooms,
    input.lat,
    input.lng,
    input.dataset,
  )
  if (!best) return { ok: false }

  const maxSearchKm = policy.maxSearchKm
  if (typeof maxSearchKm === 'number' && Number.isFinite(maxSearchKm) && best.km > maxSearchKm) {
    return { ok: false }
  }

  const factor = stepwiseFactorForKm(best.km, policy.bandsKm, policy.floorFactor)
  const baseRent = Math.max(0, best.row.avgRent)
  const adjustedRent = Math.round(baseRent * factor)

  return {
    ok: true,
    selected: {
      province: best.row.province,
      city: best.row.city,
      bedrooms: best.row.bedrooms,
      baseRent,
      distanceKm: best.km,
      factor,
      adjustedRent,
    },
  }
}

export type MarketRentPipelineResult = {
  coords: { lat: number; lng: number; via: 'fsa' | 'municipality' } | null
  nameLookup: CmhcLookupResult | null
  bundledGeo: BundledGeoRentResult
  /** Dataset city string used when name lookup succeeded (exact or fuzzy). For StatCan blend. */
  resolvedCityForMarket?: string
  nameMatch?: 'exact' | 'fuzzy-master'
}

/**
 * Resolve coordinates from the Canada places table, CMHC name lookup on the active dataset, then
 * optional bundled geo fallback (nearest row with lat/lng + distance policy).
 */
export async function runMarketRentPipeline(input: {
  formLocation: CalculatorFormState['location']
  dataset: CmhcRentRow[]
  places: PlacesProvincePayload | null
  postalFsa?: string | null
}): Promise<MarketRentPipelineResult> {
  const loc = effectiveLocationForCmhcLookup(input.formLocation)
  let nameLookup = lookupCmhcRent(loc, input.dataset)
  let resolvedCityForMarket: string | undefined
  let nameMatch: MarketRentPipelineResult['nameMatch']

  if (nameLookup) {
    resolvedCityForMarket = loc.city
    nameMatch = 'exact'
  } else {
    const masterRes = resolveClosestMasterCity(loc.province, loc.city, input.dataset)
    if (isUsableCityMatchForLookup(masterRes) && masterRes.selectedCity) {
      nameLookup = lookupCmhcRent({ ...loc, city: masterRes.selectedCity }, input.dataset)
      if (nameLookup) {
        resolvedCityForMarket = masterRes.selectedCity
        nameMatch = 'fuzzy-master'
      }
    }
  }

  let coords: MarketRentPipelineResult['coords'] = null
  if (input.places) {
    const ds = placesDatasetFromProvincePayload(input.places)
    coords = resolveLatLngFromPlaces(ds, loc.province, loc.city, input.postalFsa ?? null)
  }

  if (nameLookup) {
    return { coords, nameLookup, bundledGeo: { ok: false }, resolvedCityForMarket, nameMatch }
  }

  if (!coords) {
    return { coords: null, nameLookup: null, bundledGeo: { ok: false } }
  }

  const bundledGeo = await tryBundledGeoMarketRent({
    province: loc.province,
    city: loc.city,
    bedrooms: loc.bedrooms,
    dataset: input.dataset,
    lat: coords.lat,
    lng: coords.lng,
  })

  return { coords, nameLookup: null, bundledGeo }
}
