import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CmhcRentRow } from '../data/cmhcRents'
import { parseAmenityModifiers } from './listingAgent'

describe('parseAmenityModifiers', () => {
  it('extracts quantity and storage sqft modifiers', () => {
    const text = 'Includes 2 parking spots, 1.5 garage shared garage, and 1000 sqft storage locker.'
    const parsed = parseAmenityModifiers(text)

    expect(parsed.patch.parking?.quantity).toBe(2)
    expect(parsed.patch.garage?.quantity).toBe(1.5)
    expect(parsed.patch.garage?.shared).toBe(true)
    expect(parsed.patch.storage?.areaSqft).toBe(1000)
  })
})

describe('extractFromMemo city mapping', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  const rows: CmhcRentRow[] = [
    { province: 'AB', city: 'Calgary', bedrooms: 1, structureType: 'purpose-built', avgRent: 1500, surveyYear: 2025 },
    { province: 'AB', city: 'Edmonton', bedrooms: 1, structureType: 'purpose-built', avgRent: 1400, surveyYear: 2025 },
  ]

  it('maps non-exact city to closest CMHC city within province', async () => {
    vi.stubEnv('VITE_LISTING_AGENT_URL', '')
    vi.resetModules()
    const { extractFromMemo } = await import('./listingAgent')
    const extracted = await extractFromMemo('2 bedroom apartment in Calgery, AB for $1900 per month.', rows)
    expect(extracted.formPatch.location?.province).toBe('AB')
    expect(extracted.formPatch.location?.city).toBe('Calgary')
    expect(extracted.formPatch.location?.buildingType).toBe('apartment')
    expect(extracted.fieldAssessments['location.city']?.status).toBe('warning')
  })

  it('infers semi-detached building type from memo', async () => {
    vi.stubEnv('VITE_LISTING_AGENT_URL', '')
    vi.resetModules()
    const { extractFromMemo } = await import('./listingAgent')
    const onRows: CmhcRentRow[] = [
      { province: 'ON', city: 'Ottawa', bedrooms: 3, structureType: 'purpose-built', avgRent: 2000, surveyYear: 2025 },
    ]
    const extracted = await extractFromMemo('Semi-detached 3 bed Ottawa ON $2400/mo', onRows)
    expect(extracted.formPatch.location?.buildingType).toBe('semi-detached')
    expect(extracted.fieldAssessments['location.buildingType']?.status).toBe('found')
  })

  it('parses Canadian dollar rent with comma thousands (C$1,750)', async () => {
    vi.stubEnv('VITE_LISTING_AGENT_URL', '')
    vi.resetModules()
    const onRows: CmhcRentRow[] = [
      { province: 'ON', city: 'Cornwall', bedrooms: 2, structureType: 'purpose-built', avgRent: 1500, surveyYear: 2025 },
    ]
    const { extractFromMemo } = await import('./listingAgent')
    const extracted = await extractFromMemo('2 beds, 1 bath | C$1,750 per month in Cornwall, ON', onRows)
    expect(extracted.formPatch.askingRent).toBe(1750)
  })

  it('does not auto-enable heating on mention-only utility wording (yellow / no enable)', async () => {
    vi.stubEnv('VITE_LISTING_AGENT_URL', '')
    vi.resetModules()
    const rows: CmhcRentRow[] = [
      { province: 'ON', city: 'Ottawa', bedrooms: 2, structureType: 'purpose-built', avgRent: 1800, surveyYear: 2025 },
    ]
    const { extractFromMemo } = await import('./listingAgent')
    const extracted = await extractFromMemo('2 bed in Ottawa ON with gas heat $2000 per month', rows)
    expect(extracted.amenityEnabledPatch.heating).not.toBe(true)
    expect(extracted.fieldAssessments['amenity.heating']?.status).toBe('warning')
  })

  it('auto-enables electricity when hydro inclusion is explicit (green)', async () => {
    vi.stubEnv('VITE_LISTING_AGENT_URL', '')
    vi.resetModules()
    const rows: CmhcRentRow[] = [
      { province: 'ON', city: 'Ottawa', bedrooms: 1, structureType: 'purpose-built', avgRent: 1600, surveyYear: 2025 },
    ]
    const { extractFromMemo } = await import('./listingAgent')
    const extracted = await extractFromMemo('1 bed Ottawa ON hydro included $1500 monthly', rows)
    expect(extracted.amenityEnabledPatch.electricity).toBe(true)
    expect(extracted.fieldAssessments['amenity.electricity']?.status).toBe('found')
  })
})
