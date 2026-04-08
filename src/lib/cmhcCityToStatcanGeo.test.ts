import { describe, expect, it } from 'vitest'
import { resolveCmhcCityToStatcanGeo } from './cmhcCityToStatcanGeo'

describe('resolveCmhcCityToStatcanGeo', () => {
  const candidates = [
    'Canada',
    'Toronto, Ontario',
    'Montréal, Quebec',
    'Ottawa-Gatineau, Ontario part, Ontario/Quebec',
    'Vancouver, British Columbia',
  ]

  it('maps English Montreal alias', () => {
    expect(resolveCmhcCityToStatcanGeo('QC', 'Montreal', candidates)).toBe('Montréal, Quebec')
  })

  it('maps Ottawa to Ontario part CMA', () => {
    expect(resolveCmhcCityToStatcanGeo('ON', 'Ottawa', candidates)).toBe(
      'Ottawa-Gatineau, Ontario part, Ontario/Quebec',
    )
  })

  it('matches Toronto by fuzzy name', () => {
    expect(resolveCmhcCityToStatcanGeo('ON', 'Toronto', candidates)).toBe('Toronto, Ontario')
  })
})
