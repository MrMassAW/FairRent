import { describe, expect, it } from 'vitest'
import { parseCsvLine, parseStatCanCsv, stripBom } from './statcanCsv'

describe('statcanCsv', () => {
  it('strips BOM', () => {
    expect(stripBom('\uFEFFREF_DATE')).toBe('REF_DATE')
  })

  it('parses quoted CSV line', () => {
    const line = '"2024-01","Toronto, Ontario","Household heating fuel","164.2"'
    expect(parseCsvLine(line)).toEqual(['2024-01', 'Toronto, Ontario', 'Household heating fuel', '164.2'])
  })

  it('parses StatCan header with BOM', () => {
    const text = '\uFEFF"REF_DATE","GEO","VALUE"\n"2024-01","Canada","1.0"\n'
    const { headers, rows } = parseStatCanCsv(text)
    expect(headers).toEqual(['REF_DATE', 'GEO', 'VALUE'])
    expect(rows).toEqual([['2024-01', 'Canada', '1.0']])
  })
})
