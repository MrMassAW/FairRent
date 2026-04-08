import { fallbackCmhcRents, type CmhcRentQualityGrade, type CmhcRentRow } from '../data/cmhcRents'
import { CMHC_URBAN_CENTRES_BY_PROVINCE } from '../data/cmhcUrbanCentres'
import { getActiveDataset, getRentsForMonth } from './adminDataStore'
import { cmhcRentQualityLabel } from './cmhcRentQuality'

export interface CmhcLookupResult {
  averageRent: number
  surveyYear: number
  source: 'bundled' | 'admin-dataset'
  /** CMHC survey estimate reliability when published for this row. */
  rentQualityGrade?: CmhcRentQualityGrade
  rentQualityLabel?: string
}

export interface CmhcCityResolution {
  inputCity: string
  requestedCity: string
  selectedCity: string | null
  usedFallback: boolean
  reason?: 'empty-city' | 'exact-match' | 'fuzzy-match' | 'default-first-city' | 'no-cities-for-province'
}

/** True when the resolution is a confident match (not a default pick). Safe for rent lookup. */
export const isUsableCityMatchForLookup = (r: CmhcCityResolution): boolean =>
  r.selectedCity !== null && (r.reason === 'exact-match' || r.reason === 'fuzzy-match')

const normalize = (value: string) => value.trim().toLowerCase()

const normalizeCityToken = (value: string) => normalize(value).replace(/[^a-z0-9]/g, '')

const levenshteinDistance = (a: string, b: string): number => {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const prev = Array.from({ length: b.length + 1 }, (_, idx) => idx)
  const curr = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      )
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j]
  }
  return prev[b.length]
}

export const loadCmhcRents = async (): Promise<CmhcRentRow[]> => {
  try {
    const activeDataset = await getActiveDataset()
    if (activeDataset && activeDataset.rents.length > 0) {
      return activeDataset.rents
    }
    const response = await fetch('/data/cmhc-rents.json')
    if (!response.ok) {
      return fallbackCmhcRents
    }
    const rows = (await response.json()) as CmhcRentRow[]
    return Array.isArray(rows) && rows.length > 0 ? rows : fallbackCmhcRents
  } catch {
    return fallbackCmhcRents
  }
}

export const loadHistoricalCmhcRents = async (month: string): Promise<CmhcRentRow[]> => {
  const monthly = await getRentsForMonth(month)
  if (monthly.length === 0) {
    return loadCmhcRents()
  }
  const year = Number(month.slice(0, 4))
  return monthly.map((row) => ({
    province: row.province,
    city: row.cma,
    bedrooms: row.bedrooms,
    structureType: 'purpose-built',
    avgRent: row.avgRent,
    surveyYear: year,
  }))
}

export const getCities = (province: string, dataset: CmhcRentRow[] = fallbackCmhcRents): string[] => {
  const p = normalize(province)
  return Array.from(
    new Set(dataset.filter((row) => normalize(row.province) === p).map((row) => row.city)),
  ).sort((a, b) => a.localeCompare(b))
}

/**
 * CMHC catalog entries that are administrative labels (e.g. "County No. 10 MD") rather than recognizable place names.
 * Rent rows are never filtered — only the static urban-centre list.
 */
export const isDisplayFriendlyCatalogCity = (name: string): boolean => {
  const s = name.trim()
  if (!s) return false
  if (/^\d+$/.test(s)) return false
  if (/\bNo\.\s*\d+\b/i.test(s)) return false
  if (/\bUnorganized\b/i.test(s)) return false
  return true
}

/** CMHC urban centres for the province plus any city strings present in the active rent dataset (sorted). */
export const getCmhcCityCandidates = (province: string, dataset: CmhcRentRow[] = fallbackCmhcRents): string[] => {
  const code = province.trim().toUpperCase()
  const fromCatalog = [...(CMHC_URBAN_CENTRES_BY_PROVINCE[code] ?? [])].filter(isDisplayFriendlyCatalogCity)
  const fromRows = getCities(province, dataset)
  return Array.from(new Set([...fromCatalog, ...fromRows])).sort((a, b) => a.localeCompare(b))
}

/**
 * Fuzzy-match a city string against an explicit candidate list (e.g. municipal dropdown options).
 */
export const resolveClosestInCityList = (
  _province: string,
  city: string,
  candidates: string[],
): CmhcCityResolution => {
  const requestedCity = city.trim()
  const cities = [...candidates].sort((a, b) => a.localeCompare(b))
  const defaultCity = cities[0] ?? null
  if (cities.length === 0) {
    return {
      inputCity: city,
      requestedCity,
      selectedCity: null,
      usedFallback: false,
      reason: 'no-cities-for-province',
    }
  }

  if (!requestedCity) {
    return {
      inputCity: city,
      requestedCity,
      selectedCity: defaultCity,
      usedFallback: true,
      reason: 'empty-city',
    }
  }

  const exactMatch = cities.find((candidate) => normalize(candidate) === normalize(requestedCity))
  if (exactMatch) {
    return {
      inputCity: city,
      requestedCity,
      selectedCity: exactMatch,
      usedFallback: false,
      reason: 'exact-match',
    }
  }

  const requestedToken = normalizeCityToken(requestedCity)
  const ranked = cities
    .map((candidate) => {
      const candidateToken = normalizeCityToken(candidate)
      const distance = levenshteinDistance(requestedToken, candidateToken)
      const maxLen = Math.max(1, requestedToken.length, candidateToken.length)
      const score = 1 - distance / maxLen
      return { candidate, distance, score }
    })
    .sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance
      if (a.score !== b.score) return b.score - a.score
      return a.candidate.localeCompare(b.candidate)
    })

  const best = ranked[0]
  const strongEnough = best.score >= 0.5 || best.distance <= 3
  if (strongEnough) {
    return {
      inputCity: city,
      requestedCity,
      selectedCity: best.candidate,
      usedFallback: true,
      reason: 'fuzzy-match',
    }
  }

  return {
    inputCity: city,
    requestedCity,
    selectedCity: defaultCity,
    usedFallback: true,
    reason: 'default-first-city',
  }
}

/** Match against unique city names in the rent dataset (master DB) only. */
export const resolveClosestMasterCity = (
  province: string,
  city: string,
  dataset: CmhcRentRow[] = fallbackCmhcRents,
): CmhcCityResolution => resolveClosestInCityList(province, city, getCities(province, dataset))

export const resolveClosestCmhcCity = (
  province: string,
  city: string,
  dataset: CmhcRentRow[] = fallbackCmhcRents,
): CmhcCityResolution => {
  const rowCities = getCities(province, dataset)
  const cities = getCmhcCityCandidates(province, dataset)
  const defaultCity = rowCities[0] ?? cities[0] ?? null
  const base = resolveClosestInCityList(province, city, cities)
  if (base.reason === 'default-first-city' && defaultCity !== null) {
    return { ...base, selectedCity: defaultCity }
  }
  return base
}

const sortByBedroomDifference = (targetBedrooms: number, rows: CmhcRentRow[]) => {
  return [...rows].sort((a, b) => Math.abs(a.bedrooms - targetBedrooms) - Math.abs(b.bedrooms - targetBedrooms))
}

export const lookupCmhcRent = (input: {
  province: string
  city: string
  bedrooms: number
  structureType?: string
}, dataset: CmhcRentRow[] = fallbackCmhcRents): CmhcLookupResult | null => {
  const province = normalize(input.province)
  const city = normalize(input.city)
  const structure = input.structureType ? normalize(input.structureType) : ''

  const cityMatches = dataset.filter(
    (row) => normalize(row.province) === province && normalize(row.city) === city,
  )

  if (cityMatches.length === 0) {
    return null
  }

  const structureMatches = structure
    ? cityMatches.filter((row) => normalize(row.structureType) === structure)
    : cityMatches
  const rows = structureMatches.length > 0 ? structureMatches : cityMatches
  const best = sortByBedroomDifference(input.bedrooms, rows)[0]
  const ql = cmhcRentQualityLabel(best.rentQualityGrade)

  return {
    averageRent: best.avgRent,
    surveyYear: best.surveyYear,
    source: 'bundled',
    ...(best.rentQualityGrade ? { rentQualityGrade: best.rentQualityGrade } : {}),
    ...(ql ? { rentQualityLabel: ql } : {}),
  }
}
