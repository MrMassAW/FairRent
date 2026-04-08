import { describe, expect, it } from 'vitest'
import {
  BUILDING_TYPE_CATALOG,
  cmhcStructureTypeForBuildingType,
  DEFAULT_BUILDING_TYPE_ID,
  effectiveLocationForCmhcLookup,
  ensureLocationBuildingType,
  mergeDefaultBuildingTypeFactors,
  normalizeBuildingTypeId,
  resolveBuildingTypeFactor,
} from './buildingTypes'
import { STRUCTURE_PURPOSE_BUILT, STRUCTURE_TOWNHOUSE_APARTMENT_COMBINED } from './cmhcRmsParse'

describe('normalizeBuildingTypeId', () => {
  it('defaults unknown to apartment', () => {
    expect(normalizeBuildingTypeId(undefined)).toBe(DEFAULT_BUILDING_TYPE_ID)
    expect(normalizeBuildingTypeId('')).toBe(DEFAULT_BUILDING_TYPE_ID)
    expect(normalizeBuildingTypeId('not-a-real-type')).toBe(DEFAULT_BUILDING_TYPE_ID)
  })

  it('accepts catalog ids and aliases', () => {
    expect(normalizeBuildingTypeId('detached')).toBe('detached')
    expect(normalizeBuildingTypeId('Semi-Detached')).toBe('semi-detached')
    expect(normalizeBuildingTypeId('condo')).toBe('condo-apartment')
  })
})

describe('cmhcStructureTypeForBuildingType', () => {
  it('maps house-scale types to townhouse CMHC bucket', () => {
    expect(cmhcStructureTypeForBuildingType('detached')).toBe(STRUCTURE_TOWNHOUSE_APARTMENT_COMBINED)
    expect(cmhcStructureTypeForBuildingType('semi-detached')).toBe(STRUCTURE_TOWNHOUSE_APARTMENT_COMBINED)
    expect(cmhcStructureTypeForBuildingType('duplex')).toBe(STRUCTURE_TOWNHOUSE_APARTMENT_COMBINED)
    expect(cmhcStructureTypeForBuildingType('townhouse')).toBe(STRUCTURE_TOWNHOUSE_APARTMENT_COMBINED)
  })

  it('maps apartment-scale types to purpose-built', () => {
    expect(cmhcStructureTypeForBuildingType('apartment')).toBe(STRUCTURE_PURPOSE_BUILT)
    expect(cmhcStructureTypeForBuildingType('basement-suite')).toBe(STRUCTURE_PURPOSE_BUILT)
    expect(cmhcStructureTypeForBuildingType('condo-apartment')).toBe(STRUCTURE_PURPOSE_BUILT)
  })
})

describe('resolveBuildingTypeFactor', () => {
  it('uses catalog default when policy missing', () => {
    expect(resolveBuildingTypeFactor('apartment', undefined)).toBe(1)
    expect(resolveBuildingTypeFactor('detached', undefined)).toBe(1.15)
  })

  it('uses policy override when valid', () => {
    expect(resolveBuildingTypeFactor('apartment', { apartment: 1.1 })).toBe(1.1)
  })

  it('clamps out-of-range values', () => {
    expect(resolveBuildingTypeFactor('apartment', { apartment: 0.1 })).toBe(0.5)
    expect(resolveBuildingTypeFactor('apartment', { apartment: 9 })).toBe(1.5)
  })
})

describe('ensureLocationBuildingType', () => {
  it('preserves explicit buildingType', () => {
    expect(ensureLocationBuildingType({ province: 'ON', city: 'X', bedrooms: 1, buildingType: 'detached' }).buildingType).toBe(
      'detached',
    )
  })

  it('infers from legacy structureType', () => {
    expect(
      ensureLocationBuildingType({
        province: 'ON',
        city: 'X',
        bedrooms: 1,
        structureType: STRUCTURE_PURPOSE_BUILT,
      }).buildingType,
    ).toBe('apartment')
    expect(
      ensureLocationBuildingType({
        province: 'ON',
        city: 'X',
        bedrooms: 1,
        structureType: STRUCTURE_TOWNHOUSE_APARTMENT_COMBINED,
      }).buildingType,
    ).toBe('townhouse')
  })
})

describe('effectiveLocationForCmhcLookup', () => {
  it('sets structureType from buildingType', () => {
    const loc = effectiveLocationForCmhcLookup({
      province: 'ON',
      city: 'Toronto',
      bedrooms: 2,
      buildingType: 'detached',
    })
    expect(loc.structureType).toBe(STRUCTURE_TOWNHOUSE_APARTMENT_COMBINED)
  })
})

describe('mergeDefaultBuildingTypeFactors', () => {
  it('has one factor per catalog entry', () => {
    const m = mergeDefaultBuildingTypeFactors()
    for (const e of BUILDING_TYPE_CATALOG) {
      expect(m[e.id]).toBe(e.defaultFactor)
    }
  })
})
