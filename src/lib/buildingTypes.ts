import type { LocationInput } from '../types/calculator'
import { STRUCTURE_PURPOSE_BUILT, STRUCTURE_TOWNHOUSE_APARTMENT_COMBINED } from './cmhcRmsParse'

/** Stable ids for dropdown, LLM output, and admin factor rows. */
export interface BuildingTypeEntry {
  id: string
  label: string
  /** Default market-reference multiplier (admin can override in IndexedDB). */
  defaultFactor: number
}

/**
 * CMHC bundled data uses `purpose-built` vs `townhouse-and-private-apartment`.
 * We map user-facing building types to the closest CMHC structure bucket for lookup.
 */
export const BUILDING_TYPE_CATALOG: BuildingTypeEntry[] = [
  { id: 'apartment', label: 'Apartment (purpose-built rental)', defaultFactor: 1 },
  { id: 'condo-apartment', label: 'Condo apartment', defaultFactor: 1.02 },
  { id: 'townhouse', label: 'Townhouse / row house', defaultFactor: 1.05 },
  { id: 'semi-detached', label: 'Semi-detached', defaultFactor: 1.08 },
  { id: 'detached', label: 'Detached house', defaultFactor: 1.15 },
  { id: 'duplex', label: 'Duplex (one unit)', defaultFactor: 1.06 },
  { id: 'basement-suite', label: 'Basement / secondary suite', defaultFactor: 0.92 },
]

export const DEFAULT_BUILDING_TYPE_ID = 'apartment'

const CATALOG_BY_ID = new Map(BUILDING_TYPE_CATALOG.map((e) => [e.id, e]))

const ALIASES: Record<string, string> = {
  apartment: 'apartment',
  'apartment-building': 'apartment',
  'purpose-built': 'apartment',
  rental: 'apartment',
  condo: 'condo-apartment',
  'condo-apartment': 'condo-apartment',
  condominium: 'condo-apartment',
  townhouse: 'townhouse',
  'town-home': 'townhouse',
  rowhouse: 'townhouse',
  'row-house': 'townhouse',
  'semi-detached': 'semi-detached',
  semidetached: 'semi-detached',
  'semi detached': 'semi-detached',
  detached: 'detached',
  house: 'detached',
  duplex: 'duplex',
  'basement-suite': 'basement-suite',
  basement: 'basement-suite',
  'secondary-suite': 'basement-suite',
  'in-law': 'basement-suite',
}

/** Reject absurd admin values. */
export const BUILDING_TYPE_FACTOR_MIN = 0.5
export const BUILDING_TYPE_FACTOR_MAX = 1.5

export const normalizeBuildingTypeId = (raw: string | undefined): string => {
  if (!raw || typeof raw !== 'string') return DEFAULT_BUILDING_TYPE_ID
  const key = raw.trim().toLowerCase().replace(/\s+/g, '-')
  if (CATALOG_BY_ID.has(key)) return key
  const alias = ALIASES[key]
  if (alias) return alias
  return DEFAULT_BUILDING_TYPE_ID
}

export const cmhcStructureTypeForBuildingType = (buildingTypeId: string): typeof STRUCTURE_PURPOSE_BUILT | typeof STRUCTURE_TOWNHOUSE_APARTMENT_COMBINED => {
  const id = normalizeBuildingTypeId(buildingTypeId)
  switch (id) {
    case 'townhouse':
    case 'semi-detached':
    case 'detached':
    case 'duplex':
      return STRUCTURE_TOWNHOUSE_APARTMENT_COMBINED
    default:
      return STRUCTURE_PURPOSE_BUILT
  }
}

export const defaultFactorForBuildingType = (buildingTypeId: string): number => {
  const id = normalizeBuildingTypeId(buildingTypeId)
  return CATALOG_BY_ID.get(id)?.defaultFactor ?? 1
}

export const resolveBuildingTypeFactor = (buildingTypeId: string, policyFactors: Record<string, number> | undefined): number => {
  const id = normalizeBuildingTypeId(buildingTypeId)
  const fromPolicy = policyFactors?.[id]
  const base = typeof fromPolicy === 'number' && Number.isFinite(fromPolicy) ? fromPolicy : defaultFactorForBuildingType(id)
  return Math.min(BUILDING_TYPE_FACTOR_MAX, Math.max(BUILDING_TYPE_FACTOR_MIN, base))
}

/**
 * When loading legacy persisted state that has CMHC `structureType` but no `buildingType`.
 */
export const inferBuildingTypeFromLegacyStructure = (structureType: string | undefined): string | undefined => {
  if (!structureType) return undefined
  const s = structureType.trim().toLowerCase()
  if (s === STRUCTURE_TOWNHOUSE_APARTMENT_COMBINED) return 'townhouse'
  if (s === STRUCTURE_PURPOSE_BUILT) return 'apartment'
  return undefined
}

export const ensureLocationBuildingType = (location: LocationInput): LocationInput => {
  if (location.buildingType) return location
  const inferred = inferBuildingTypeFromLegacyStructure(location.structureType)
  return { ...location, buildingType: inferred ?? DEFAULT_BUILDING_TYPE_ID }
}

/** Pass into `lookupCmhcRent`: structure type from building type, with legacy fallback. */
export const effectiveLocationForCmhcLookup = (location: LocationInput): LocationInput => {
  const withType = ensureLocationBuildingType(location)
  const structureType = cmhcStructureTypeForBuildingType(withType.buildingType ?? DEFAULT_BUILDING_TYPE_ID)
  return { ...withType, structureType }
}

export const mergeDefaultBuildingTypeFactors = (): Record<string, number> =>
  Object.fromEntries(BUILDING_TYPE_CATALOG.map((e) => [e.id, e.defaultFactor]))
