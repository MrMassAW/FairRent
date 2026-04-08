import { describe, expect, it } from 'vitest'

import { buildCanadaGeoDatasetFromSgcStructureCsv, parseCsvRow } from './buildCanadaGeoFromSgc'

describe('parseCsvRow', () => {
  it('parses quoted fields with commas', () => {
    expect(parseCsvRow('4,Census subdivision,1001101,"Division No. 1, Subd. V"')).toEqual([
      '4',
      'Census subdivision',
      '1001101',
      'Division No. 1, Subd. V',
    ])
  })
})

describe('buildCanadaGeoDatasetFromSgcStructureCsv', () => {
  const sample = `Level,Hierarchical structure,Code,Class title
2,Province and territory,35,Ontario
4,Census subdivision,3520005,Toronto
4,Census subdivision,3524009,Ottawa
2,Province and territory,60,Yukon
4,Census subdivision,6001006,Whitehorse
`

  it('extracts provinces and census subdivisions with correct province mapping', () => {
    const ds = buildCanadaGeoDatasetFromSgcStructureCsv(sample, 'fixture')
    expect(ds.provinces.map((p) => p.code).sort()).toContain('ON')
    expect(ds.provinces.map((p) => p.code).sort()).toContain('YT')
    expect(ds.municipalitiesByProvince.ON).toContain('Toronto')
    expect(ds.municipalitiesByProvince.ON).toContain('Ottawa')
    expect(ds.municipalitiesByProvince.YT).toContain('Whitehorse')
  })
})
