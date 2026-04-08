import { describe, expect, it } from 'vitest'
import { validateAndMapListingJson } from './parseModelJson'

describe('validateAndMapListingJson', () => {
  it('accepts null for optional numeric costs.utilities and omits it from formPatch', () => {
    const json = JSON.stringify({
      notes: [],
      formPatch: {
        costs: {
          utilities: null,
          mortgage: 1200,
        },
      },
    })
    const extraction = validateAndMapListingJson(json, 'test')
    expect(extraction.formPatch.costs?.mortgage).toBe(1200)
    expect(extraction.formPatch.costs?.utilities).toBeUndefined()
  })

  it('maps location.buildingType from model JSON', () => {
    const json = JSON.stringify({
      notes: [],
      formPatch: { location: { buildingType: 'detached', province: 'ON' } },
    })
    const extraction = validateAndMapListingJson(json, 'test')
    expect(extraction.formPatch.location?.buildingType).toBe('detached')
    expect(extraction.formPatch.location?.province).toBe('ON')
  })
})
