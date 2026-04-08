import { describe, expect, it } from 'vitest'
import {
  ingestTable312FromRows,
  mergeCmhcRentRows,
  parseMoneyCell,
  STRUCTURE_PURPOSE_BUILT,
  STRUCTURE_TOWNHOUSE_APARTMENT_COMBINED,
} from './cmhcRmsParse'

describe('parseMoneyCell', () => {
  it('parses plain numbers', () => {
    expect(parseMoneyCell('1,234')).toEqual({ value: 1234 })
    expect(parseMoneyCell(900)).toEqual({ value: 900 })
  })
  it('parses rent with trailing quality letter', () => {
    expect(parseMoneyCell('1,077 b')).toEqual({ value: 1077, rentQualityGrade: 'b' })
    expect(parseMoneyCell('866d')).toEqual({ value: 866, rentQualityGrade: 'd' })
  })
  it('returns null for ** and empty', () => {
    expect(parseMoneyCell('**')).toEqual({ value: null })
    expect(parseMoneyCell('')).toEqual({ value: null })
  })
})

describe('ingestTable312FromRows', () => {
  it('extracts Oct-25 rents and grades for BC sample row', () => {
    const rows: unknown[][] = [
      [],
      [],
      [],
      [],
      ['', 'Studio', '', '', '1 Bedroom', '', '', '2 Bedroom', '', '', '3 Bedroom +', '', '', 'Total'],
      [
        'Centre',
        'Oct-24',
        '',
        'Oct-25',
        '',
        'Oct-24',
        '',
        'Oct-25',
        '',
        'Oct-24',
        '',
        'Oct-25',
        '',
        'Oct-24',
        '',
        'Oct-25',
        '',
        'Oct-24',
        '',
        'Oct-25',
        '',
      ],
      ['Testville CMA', '1,100', 'a', '1,200', 'b', '1,300', 'a', '1,400', 'c', '1,500', 'a', '1,600', 'd', '1,700', 'a', '1,800', 'b'],
    ]
    const out = ingestTable312FromRows(rows, 2025, 'BC')
    expect(out).toContainEqual(
      expect.objectContaining({
        province: 'BC',
        city: 'Testville',
        bedrooms: 0,
        structureType: STRUCTURE_TOWNHOUSE_APARTMENT_COMBINED,
        avgRent: 1200,
        rentQualityGrade: 'b',
        surveyYear: 2025,
      }),
    )
    expect(out.some((r) => r.bedrooms === 2 && r.avgRent === 1600 && r.rentQualityGrade === 'd')).toBe(true)
    expect(out.some((r) => r.bedrooms === 3 && r.avgRent === 1800 && r.rentQualityGrade === 'b')).toBe(true)
  })
})

describe('mergeCmhcRentRows', () => {
  it('later row overwrites same key', () => {
    const a = [
      {
        province: 'ON',
        city: 'London',
        bedrooms: 1,
        structureType: STRUCTURE_PURPOSE_BUILT,
        avgRent: 1000,
        surveyYear: 2025,
      },
    ]
    const b = [
      {
        province: 'ON',
        city: 'London',
        bedrooms: 1,
        structureType: STRUCTURE_PURPOSE_BUILT,
        avgRent: 1100,
        surveyYear: 2025,
        rentQualityGrade: 'a' as const,
      },
    ]
    const m = mergeCmhcRentRows(a, b)
    expect(m).toHaveLength(1)
    expect(m[0].avgRent).toBe(1100)
    expect(m[0].rentQualityGrade).toBe('a')
  })

  it('keeps distinct structure types', () => {
    const m = mergeCmhcRentRows(
      [
        {
          province: 'BC',
          city: 'Vancouver',
          bedrooms: 1,
          structureType: STRUCTURE_PURPOSE_BUILT,
          avgRent: 1700,
          surveyYear: 2025,
        },
      ],
      [
        {
          province: 'BC',
          city: 'Vancouver',
          bedrooms: 1,
          structureType: STRUCTURE_TOWNHOUSE_APARTMENT_COMBINED,
          avgRent: 1800,
          surveyYear: 2025,
        },
      ],
    )
    expect(m).toHaveLength(2)
  })
})
