import type { AmenityModifierInput, CalculatorFormState, LocationInput } from '../types/calculator'
import type { CmhcRentRow } from '../data/cmhcRents'
import { AMENITY_CATALOG } from './amenitiesCatalog'
import { effectiveLocationForCmhcLookup, ensureLocationBuildingType, normalizeBuildingTypeId } from './buildingTypes'
import { resolveClosestMasterCity } from './cmhcLookup'
import type { FieldAssessment, ListingExtraction, ListingFormPatch } from './listingAgentContract'

const UTILITY_IDS = new Set(AMENITY_CATALOG.filter((a) => a.group === 'utilities').map((a) => a.id))

const provinceMap: Record<string, string> = {
  alberta: 'AB',
  'british columbia': 'BC',
  manitoba: 'MB',
  'new brunswick': 'NB',
  'newfoundland and labrador': 'NL',
  'nova scotia': 'NS',
  ontario: 'ON',
  'prince edward island': 'PE',
  quebec: 'QC',
  saskatchewan: 'SK',
}

interface AmenityKeywordRule {
  id: string
  option: string
  keywords: string[]
  /** For utilities group only: explicit inclusion in rent vs mention without confirmation. */
  inclusion?: 'included' | 'uncertain'
}

const amenityRules: AmenityKeywordRule[] = [
  { id: 'electricity', option: 'base', keywords: ['electricity included', 'hydro included'], inclusion: 'included' },
  { id: 'heating', option: 'gas', keywords: ['gas heat included', 'natural gas heating included', 'heat included', 'heating included'], inclusion: 'included' },
  { id: 'heating', option: 'oil', keywords: ['oil heat included', 'oil heating included'], inclusion: 'included' },
  { id: 'heating', option: 'electric', keywords: ['electric heat included', 'electric heating included'], inclusion: 'included' },
  { id: 'heating', option: 'gas', keywords: ['gas heat', 'natural gas heating'], inclusion: 'uncertain' },
  { id: 'heating', option: 'electric', keywords: ['electric heat', 'baseboard heating'], inclusion: 'uncertain' },
  { id: 'heating', option: 'oil', keywords: ['oil heat', 'oil heating'], inclusion: 'uncertain' },
  { id: 'waterSewage', option: 'normal', keywords: ['water included', 'sewer included', 'sewage included'], inclusion: 'included' },
  { id: 'naturalGas', option: 'basic', keywords: ['natural gas included'], inclusion: 'included' },
  { id: 'naturalGas', option: 'basic', keywords: ['gas fireplace', 'gas stove', 'gas cooking'], inclusion: 'uncertain' },
  { id: 'waste', option: 'full', keywords: ['garbage included', 'trash included', 'waste included', 'recycling included'], inclusion: 'included' },
  { id: 'waste', option: 'full', keywords: ['garbage pickup', 'waste management', 'trash pickup'], inclusion: 'uncertain' },
  { id: 'internet', option: 'fiber', keywords: ['fiber internet', 'fibre internet'] },
  { id: 'internet', option: 'cable', keywords: ['wifi included', 'wi-fi included', 'internet included'] },
  { id: 'cableTv', option: 'basic', keywords: ['cable included', 'tv package included'] },
  { id: 'parking', option: 'reserved', keywords: ['parking included', '1 parking', 'one parking'] },
  { id: 'garage', option: 'heatedGarage', keywords: ['underground parking', 'heated garage'] },
  { id: 'storage', option: 'locker', keywords: ['storage locker', 'locker included'] },
  { id: 'fitness', option: 'gym', keywords: ['gym', 'fitness centre', 'fitness center'] },
  { id: 'poolSpa', option: 'pool', keywords: ['pool', 'swimming pool'] },
  { id: 'commonAreas', option: 'rooftop', keywords: ['rooftop', 'bbq terrace'] },
  { id: 'laundry', option: 'inUnit', keywords: ['in-unit laundry', 'ensuite laundry', 'washer dryer'] },
  { id: 'laundry', option: 'shared', keywords: ['coin laundry', 'shared laundry'] },
  { id: 'security', option: '24h', keywords: ['24/7 concierge', '24 hour concierge', '24h security'] },
  { id: 'appliances', option: 'standard', keywords: ['stainless steel appliances', 'appliances included'] },
  { id: 'furniture', option: 'full', keywords: ['fully furnished'] },
  { id: 'furniture', option: 'semi', keywords: ['semi furnished', 'partially furnished'] },
]

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

interface ParsedField<T> {
  value?: T
  evidence?: string
  isUncertain?: boolean
}

const normalizeEvidence = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 220)

const parseMoney = (text: string): ParsedField<number> => {
  /** `C$1,750`, `$1,750`, `$1900` (comma thousands need 1–3 digits before first comma). */
  const pattern = /(?:\bC\$|\$)\s*((?:[0-9]{1,3})(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/gi
  const matches = [...text.matchAll(pattern)]
  if (matches.length === 0) return {}
  const monthly = matches.find((entry) => /\b(month|mo|\/m|per month)\b/i.test(text.slice(Math.max(0, entry.index ?? 0) - 20, (entry.index ?? 0) + 60)))
  const selected = monthly ?? matches[0]
  if (!selected || !selected[1]) return {}
  const amount = Number(selected[1].replaceAll(',', ''))
  if (!Number.isFinite(amount)) return {}
  const index = selected.index ?? 0
  const snippet = text.slice(Math.max(0, index - 40), index + 80)
  return { value: amount, evidence: normalizeEvidence(snippet), isUncertain: !monthly }
}

const parseBedrooms = (text: string): ParsedField<number> => {
  const match = text.match(/(\d(?:\.\d)?)\s*(?:bed|beds|bedroom|br)\b/i)
  if (!match || !match[1]) return {}
  const parsed = Math.round(Number(match[1]))
  if (!Number.isFinite(parsed)) return {}
  const index = match.index ?? 0
  const snippet = text.slice(Math.max(0, index - 40), index + 80)
  return { value: Math.max(0, Math.min(5, parsed)), evidence: normalizeEvidence(snippet) }
}

const parseSquareFeet = (text: string): ParsedField<number> => {
  const match = text.match(/([0-9]{3,5})\s*(?:sq\s*\.?\s*ft|sqft|square feet)\b/i)
  if (!match || !match[1]) return {}
  const parsed = Number(match[1])
  if (!Number.isFinite(parsed)) return {}
  const index = match.index ?? 0
  const snippet = text.slice(Math.max(0, index - 40), index + 80)
  return { value: parsed, evidence: normalizeEvidence(snippet) }
}

const parseBuildingType = (text: string): ParsedField<string> => {
  if (/\b(basement\s+(suite|apartment|unit)|secondary\s+suite|in[- ]law(\s+suite|\s+apartment|\s+unit)?)\b/i.test(text)) {
    return { value: 'basement-suite', evidence: normalizeEvidence(text.slice(0, 120)) }
  }
  if (/\bsemi[-\s]?detached\b/i.test(text)) {
    return { value: 'semi-detached', evidence: normalizeEvidence(text.slice(0, 120)) }
  }
  if (/\bduplex\b/i.test(text)) {
    const m = text.match(/\bduplex\b/i)
    const idx = m?.index ?? 0
    return { value: 'duplex', evidence: normalizeEvidence(text.slice(Math.max(0, idx - 30), idx + 40)) }
  }
  if (/\bdetached\b/i.test(text)) {
    const m = text.match(/\bdetached\b/i)
    const idx = m?.index ?? 0
    return { value: 'detached', evidence: normalizeEvidence(text.slice(Math.max(0, idx - 30), idx + 40)) }
  }
  if (/\b(townhouse|townhome|town[-\s]home|row\s*house)\b/i.test(text)) {
    return { value: 'townhouse', evidence: normalizeEvidence(text.slice(0, 120)) }
  }
  if (/\bcondo(?:minium)?\b/i.test(text)) {
    return { value: 'condo-apartment', evidence: normalizeEvidence(text.slice(0, 120)) }
  }
  if (/\b(apartment|apt\.?|flat)\b/i.test(text)) {
    return { value: 'apartment', evidence: normalizeEvidence(text.slice(0, 120)) }
  }
  return {}
}

const parseProvince = (text: string): ParsedField<string> => {
  const normalized = normalize(text)
  for (const [name, code] of Object.entries(provinceMap)) {
    if (normalized.includes(name)) return { value: code, evidence: name }
  }
  const codeMatch = text.match(/\b(AB|BC|MB|NB|NL|NS|ON|PE|QC|SK)\b/i)
  const value = codeMatch?.[1]?.toUpperCase()
  if (!value) return {}
  return { value, evidence: value }
}

const parseCity = (text: string, rows: CmhcRentRow[]): ParsedField<string> => {
  const normalized = normalize(text)
  const cities = Array.from(new Set(rows.map((row) => row.city))).sort((a, b) => b.length - a.length)
  const city = cities.find((candidate) => normalized.includes(normalize(candidate)))
  if (!city) return {}
  return { value: city, evidence: city }
}

const parseCityNearProvince = (text: string): ParsedField<string> => {
  const withProvince = text.match(/\bin\s+([A-Za-z][A-Za-z\s.'-]{1,50}?)[,\s]+(?:AB|BC|MB|NB|NL|NS|ON|PE|QC|SK)\b/i)
  if (withProvince && withProvince[1]) {
    return { value: withProvince[1].trim(), evidence: normalizeEvidence(withProvince[0]) }
  }
  const cityProvince = text.match(/\b([A-Za-z][A-Za-z\s.'-]{1,50}?)\s*,\s*(?:AB|BC|MB|NB|NL|NS|ON|PE|QC|SK)\b/i)
  if (cityProvince && cityProvince[1]) {
    return { value: cityProvince[1].trim(), evidence: normalizeEvidence(cityProvince[0]) }
  }
  return {}
}

interface UtilityBest {
  inclusion: 'included' | 'uncertain'
  option: string
  keyword: string
}

const considerUtilityMatch = (best: Record<string, UtilityBest>, id: string, inclusion: 'included' | 'uncertain', option: string, keyword: string) => {
  const prev = best[id]
  if (!prev) {
    best[id] = { inclusion, option, keyword }
    return
  }
  if (inclusion === 'included') {
    best[id] = { inclusion, option, keyword }
    return
  }
  if (prev.inclusion === 'uncertain') {
    best[id] = { inclusion, option, keyword }
  }
}

const inferAmenities = (text: string) => {
  const normalized = normalize(text)
  const enabledPatch: Record<string, boolean> = {}
  const optionPatch: Record<string, string> = {}
  const matchedEvidence: Record<string, string> = {}
  const utilityBest: Record<string, UtilityBest> = {}

  for (const rule of amenityRules) {
    const matchedKeyword = rule.keywords.find((keyword) => normalized.includes(normalize(keyword)))
    if (!matchedKeyword) continue

    if (UTILITY_IDS.has(rule.id)) {
      const tier = rule.inclusion
      if (!tier) continue
      considerUtilityMatch(utilityBest, rule.id, tier, rule.option, matchedKeyword)
    } else {
      enabledPatch[rule.id] = true
      optionPatch[rule.id] = rule.option
      matchedEvidence[rule.id] = matchedKeyword
    }
  }

  const utilityTier: Record<string, 'included' | 'uncertain'> = {}
  for (const id of UTILITY_IDS) {
    const b = utilityBest[id]
    if (b) {
      utilityTier[id] = b.inclusion
      optionPatch[id] = b.option
      matchedEvidence[id] = b.keyword
      if (b.inclusion === 'included') enabledPatch[id] = true
    }
  }

  return { enabledPatch, optionPatch, matchedEvidence, utilityTier }
}

interface ParsedAmenityModifier {
  patch: Record<string, AmenityModifierInput>
  evidence: Record<string, string>
}

export const parseAmenityModifiers = (text: string): ParsedAmenityModifier => {
  const patch: Record<string, AmenityModifierInput> = {}
  const evidence: Record<string, string> = {}

  const parkingMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:parking|parkings|spot|spots|stall|stalls)\b/i)
  if (parkingMatch && parkingMatch[1]) {
    const quantity = Number(parkingMatch[1])
    if (Number.isFinite(quantity)) {
      patch.parking = { quantity }
      evidence.parking = normalizeEvidence(parkingMatch[0])
    }
  }

  const garageMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:garage|garages|bay|bays)\b/i)
  if (garageMatch && garageMatch[1]) {
    const quantity = Number(garageMatch[1])
    if (Number.isFinite(quantity)) {
      patch.garage = { ...(patch.garage ?? {}), quantity }
      evidence.garage = normalizeEvidence(garageMatch[0])
    }
  }

  if (/\bshared garage\b/i.test(text)) {
    patch.garage = { ...(patch.garage ?? {}), shared: true }
    evidence.garage = evidence.garage ? `${evidence.garage}; shared garage` : 'shared garage'
  }

  const storageSqftMatch = text.match(/(\d{2,5})\s*(?:sq\s*\.?\s*ft|sqft|square feet)\s*(?:of\s*)?(?:storage|locker|cage)\b/i)
  if (storageSqftMatch && storageSqftMatch[1]) {
    const areaSqft = Number(storageSqftMatch[1])
    if (Number.isFinite(areaSqft)) {
      patch.storage = { ...(patch.storage ?? {}), areaSqft }
      evidence.storage = normalizeEvidence(storageSqftMatch[0])
    }
  }

  const storageQuantityMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:storage lockers?|lockers?|cages?)\b/i)
  if (storageQuantityMatch && storageQuantityMatch[1]) {
    const quantity = Number(storageQuantityMatch[1])
    if (Number.isFinite(quantity)) {
      patch.storage = { ...(patch.storage ?? {}), quantity }
      evidence.storage = evidence.storage ? `${evidence.storage}; ${normalizeEvidence(storageQuantityMatch[0])}` : normalizeEvidence(storageQuantityMatch[0])
    }
  }

  return { patch, evidence }
}

export const fetchListingText = async (url: string): Promise<string> => {
  const proxyUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//i, '')}`
  const response = await fetch(proxyUrl)
  if (!response.ok) {
    throw new Error(`Could not read listing page (${response.status})`)
  }
  return response.text()
}

export const extractFromTextHeuristic = (text: string, rows: CmhcRentRow[]): ListingExtraction => {
  const province = parseProvince(text)
  const city = parseCity(text, rows)
  const cityNearProvince = !city.value ? parseCityNearProvince(text) : {}
  const resolvedCity = province.value && city.value
    ? resolveClosestMasterCity(province.value, city.value, rows)
    : province.value && cityNearProvince.value
      ? resolveClosestMasterCity(province.value, cityNearProvince.value, rows)
      : null
  const cityValue = resolvedCity?.selectedCity ?? city.value
  const bedrooms = parseBedrooms(text)
  const squareFeet = parseSquareFeet(text)
  const buildingType = parseBuildingType(text)
  const askingRent = parseMoney(text)
  const amenityInference = inferAmenities(text)
  const amenityModifierInference = parseAmenityModifiers(text)
  for (const amenityId of Object.keys(amenityModifierInference.patch)) {
    amenityInference.enabledPatch[amenityId] = true
  }
  const notes: string[] = []
  const fieldAssessments: Record<string, FieldAssessment> = {}

  const locationPatch: Partial<CalculatorFormState['location']> = {
    ...(province.value ? { province: province.value } : {}),
    ...(cityValue ? { city: cityValue } : {}),
    ...(typeof bedrooms.value === 'number' ? { bedrooms: bedrooms.value } : {}),
    ...(buildingType.value ? { buildingType: normalizeBuildingTypeId(buildingType.value) } : {}),
  }

  if (locationPatch.buildingType) {
    const locForCmhc: LocationInput = ensureLocationBuildingType({
      province: locationPatch.province ?? 'ON',
      city: locationPatch.city ?? '',
      bedrooms: typeof locationPatch.bedrooms === 'number' ? locationPatch.bedrooms : 0,
      buildingType: locationPatch.buildingType,
    })
    locationPatch.structureType = effectiveLocationForCmhcLookup(locForCmhc).structureType
  }
  const unitPatch: Partial<CalculatorFormState['unit']> = {
    ...(typeof squareFeet.value === 'number' ? { squareFeet: squareFeet.value } : {}),
  }
  const formPatch: ListingFormPatch = {
    ...(Object.keys(locationPatch).length > 0 ? { location: locationPatch } : {}),
    ...(Object.keys(unitPatch).length > 0 ? { unit: unitPatch } : {}),
    ...(typeof askingRent.value === 'number' ? { askingRent: askingRent.value } : {}),
  }

  fieldAssessments['location.province'] = province.value
    ? { status: 'found', details: `Province confirmed as ${province.value}.`, evidence: province.evidence }
    : { status: 'unknown', details: 'Province was not clearly mentioned in the listing.' }
  fieldAssessments['location.city'] = cityValue
    ? resolvedCity?.usedFallback
      ? {
          status: 'warning',
          details: `City interpreted as ${cityValue} based on closest CMHC match.`,
          evidence: city.evidence ?? cityNearProvince.evidence,
        }
      : { status: 'found', details: `City confirmed as ${cityValue}.`, evidence: city.evidence ?? cityNearProvince.evidence }
    : { status: 'unknown', details: 'City was not clearly mentioned in the listing.' }
  fieldAssessments['location.bedrooms'] = typeof bedrooms.value === 'number'
    ? { status: 'found', details: `Bedroom count confirmed as ${bedrooms.value}.`, evidence: bedrooms.evidence }
    : { status: 'unknown', details: 'Bedroom count was not clearly stated in the listing.' }
  fieldAssessments['location.buildingType'] = buildingType.value
    ? {
        status: 'found',
        details: `Building type inferred as ${normalizeBuildingTypeId(buildingType.value)}.`,
        evidence: buildingType.evidence,
      }
    : { status: 'unknown', details: 'Building type was not clearly stated in the listing.' }
  fieldAssessments['unit.squareFeet'] = typeof squareFeet.value === 'number'
    ? { status: 'found', details: `Square footage confirmed as ${squareFeet.value} sqft.`, evidence: squareFeet.evidence }
    : { status: 'unknown', details: 'Square footage was not clearly stated in the listing.' }
  fieldAssessments['askingRent'] = typeof askingRent.value === 'number'
    ? askingRent.isUncertain
      ? {
          status: 'warning',
          details: `A rent-like amount was found ($${askingRent.value}), but monthly wording was unclear.`,
          evidence: askingRent.evidence,
        }
      : { status: 'found', details: `Asking rent confirmed as $${askingRent.value}.`, evidence: askingRent.evidence }
    : { status: 'unknown', details: 'Asking rent was not clearly stated in the listing.' }
  fieldAssessments['amenity.parking.quantity'] = typeof amenityModifierInference.patch.parking?.quantity === 'number'
    ? {
        status: 'found',
        details: `Parking quantity inferred as ${amenityModifierInference.patch.parking.quantity}.`,
        evidence: amenityModifierInference.evidence.parking,
      }
    : { status: 'unknown', details: 'Parking quantity was not clearly stated in the listing.' }
  fieldAssessments['amenity.garage.quantity'] = typeof amenityModifierInference.patch.garage?.quantity === 'number'
    ? {
        status: 'found',
        details: `Garage quantity inferred as ${amenityModifierInference.patch.garage.quantity}.`,
        evidence: amenityModifierInference.evidence.garage,
      }
    : { status: 'unknown', details: 'Garage quantity was not clearly stated in the listing.' }
  fieldAssessments['amenity.garage.shared'] = amenityModifierInference.patch.garage?.shared
    ? {
        status: 'found',
        details: 'Shared garage wording was found in listing text.',
        evidence: amenityModifierInference.evidence.garage,
      }
    : { status: 'unknown', details: 'Shared garage was not clearly stated in the listing.' }
  fieldAssessments['amenity.storage.areaSqft'] = typeof amenityModifierInference.patch.storage?.areaSqft === 'number'
    ? {
        status: 'found',
        details: `Storage area inferred as ${amenityModifierInference.patch.storage.areaSqft} sqft.`,
        evidence: amenityModifierInference.evidence.storage,
      }
    : { status: 'unknown', details: 'Storage area was not clearly stated in the listing.' }

  if (!province.value) notes.push('Province not detected')
  if (!city.value) notes.push('City not detected')
  if (typeof bedrooms.value !== 'number') notes.push('Bedrooms not detected')
  if (typeof askingRent.value !== 'number') notes.push('Asking rent not detected')

  for (const id of UTILITY_IDS) {
    const key = `amenity.${id}`
    if (fieldAssessments[key]) continue
    const tier = amenityInference.utilityTier[id]
    if (tier === 'included') {
      fieldAssessments[key] = {
        status: 'found',
        details: `${id} inclusion inferred from listing text.`,
        evidence: amenityInference.matchedEvidence[id],
      }
    } else if (tier === 'uncertain') {
      fieldAssessments[key] = {
        status: 'warning',
        details: `${id} mentioned but inclusion in rent unclear.`,
        evidence: amenityInference.matchedEvidence[id],
      }
    } else {
      fieldAssessments[key] = {
        status: 'unknown',
        details: `${id} was not clearly stated in the listing text.`,
      }
    }
  }

  const inferredAmenityIds = new Set(Object.keys(amenityInference.enabledPatch))
  for (const rule of amenityRules) {
    if (UTILITY_IDS.has(rule.id)) continue
    const key = `amenity.${rule.id}`
    if (fieldAssessments[key]) continue
    if (inferredAmenityIds.has(rule.id)) {
      fieldAssessments[key] = {
        status: 'found',
        details: `${rule.id} inferred from listing keywords.`,
        evidence: amenityInference.matchedEvidence[rule.id],
      }
      continue
    }
    fieldAssessments[key] = {
      status: 'unknown',
      details: `${rule.id} was not clearly stated in the listing text.`,
    }
  }

  return {
    formPatch,
    amenityEnabledPatch: amenityInference.enabledPatch,
    amenityOptionPatch: amenityInference.optionPatch,
    amenityModifierPatch: amenityModifierInference.patch,
    amenityOverridePatch: {},
    notes,
    fieldAssessments,
  }
}
