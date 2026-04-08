import type { CmhcRentQualityGrade, CmhcRentRow } from '../data/cmhcRents'
import { parseQualityLetter } from './cmhcRentQuality'

export const STRUCTURE_PURPOSE_BUILT = 'purpose-built'
export const STRUCTURE_TOWNHOUSE_APARTMENT_COMBINED = 'townhouse-and-private-apartment'

export type CmhcIngestProfile =
  | 'rms-table-60-purpose-built'
  | 'rms-table-312-townhouse-apartment-combined'

/** Parsed rent cell: plain number, or number with optional trailing letter in same string. */
export const parseMoneyCell = (cell: unknown): { value: number | null; rentQualityGrade?: CmhcRentQualityGrade } => {
  if (cell === undefined || cell === null) return { value: null }
  const s = String(cell).trim()
  if (s === '' || s === '**') return { value: null }
  const letterMatch = s.match(/^([\d,]+)\s*([a-dA-D])\s*$/)
  if (letterMatch) {
    const n = Number(letterMatch[1].replace(/,/g, ''))
    const g = parseQualityLetter(letterMatch[2])
    return Number.isFinite(n) && n > 0 ? { value: n, rentQualityGrade: g } : { value: null }
  }
  const cleaned = s.replace(/,/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) && n > 0 ? { value: n } : { value: null }
}

const provinceFromAggregate = (name: string): string | null => {
  const n = name.trim()
  if (!n.endsWith('10,000+') || n.startsWith('Canada')) return null
  const rules: [RegExp, string][] = [
    [/^Newfoundland and Labrador/i, 'NL'],
    [/^Prince Edward Island/i, 'PE'],
    [/^Nova Scotia/i, 'NS'],
    [/^New Brunswick/i, 'NB'],
    [/^Québec|^Quebec/i, 'QC'],
    [/^Ontario/i, 'ON'],
    [/^Manitoba/i, 'MB'],
    [/^Saskatchewan/i, 'SK'],
    [/^Alberta/i, 'AB'],
    [/^British Columbia/i, 'BC'],
  ]
  for (const [re, code] of rules) {
    if (re.test(n)) return code
  }
  return null
}

const shouldEmitCentreRowTable60 = (name: string): boolean => {
  const n = name.trim()
  if (!n || n.startsWith('§') || n.startsWith('Quality') || n.includes('Source:')) return false
  if (n.startsWith('Canada')) return false
  if (n.includes('10,000+')) return false
  return n.includes('CMA') || / CA\s*$/i.test(n)
}

const simplifyCityName = (name: string): string =>
  name
    .replace(/\s+CMA\s*\(Qué\. part\)\s*$/i, ' (Qué. part)')
    .replace(/\s+CMA\s*\(Ont\. part\)\s*$/i, ' (Ont. part)')
    .replace(/\s+CMA\s*$/i, '')
    .replace(/\s+CA\s*$/i, '')
    .replace(/\s+DM\s*$/i, '')
    .replace(/\s+RDA\s*$/i, '')
    .trim()

const provinceForCentre = (name: string, current: string): string => {
  if (name.includes('(Qué. part)')) return 'QC'
  if (name.includes('(Ont. part)')) return 'ON'
  return current
}

/**
 * Non-turnover block: Oct-25 rent column + adjacent quality column per bedroom (Table 6.0 layout, 2025).
 * Layout version: rmr-canada-2025-en.xlsx
 */
const NT_OCT25_RENT_AND_GRADE: { bedrooms: number; rentCol: number; gradeCol: number }[] = [
  { bedrooms: 0, rentCol: 26, gradeCol: 27 },
  { bedrooms: 1, rentCol: 30, gradeCol: 31 },
  { bedrooms: 2, rentCol: 34, gradeCol: 35 },
  { bedrooms: 3, rentCol: 38, gradeCol: 39 },
]

export const ingestTable60FromRows = (rows: unknown[][], surveyYear: number): CmhcRentRow[] => {
  const out: CmhcRentRow[] = []
  let currentProvince = ''

  for (const row of rows) {
    const rawName = row[0]
    if (typeof rawName !== 'string') continue
    const name = rawName.trim()
    if (!name) continue

    const agg = provinceFromAggregate(name)
    if (agg) {
      currentProvince = agg
      continue
    }
    if (!shouldEmitCentreRowTable60(name)) continue

    const prov = provinceForCentre(name, currentProvince)
    if (!prov) continue

    const city = simplifyCityName(name)
    for (const { bedrooms, rentCol, gradeCol } of NT_OCT25_RENT_AND_GRADE) {
      const { value, rentQualityGrade: fromCell } = parseMoneyCell(row[rentCol])
      if (value === null) continue
      const fromAdj = parseQualityLetter(row[gradeCol])
      const rentQualityGrade = fromAdj ?? fromCell
      out.push({
        province: prov,
        city,
        bedrooms,
        structureType: STRUCTURE_PURPOSE_BUILT,
        avgRent: Math.round(value),
        surveyYear,
        ...(rentQualityGrade ? { rentQualityGrade } : {}),
      })
    }
  }

  return sortCmhcRentRows(out)
}

/** Table 3.1.2 (2025 BC): Oct-25 rent + grade pairs per bedroom block. Layout: rmr-british-columbia-2025-en.xlsx */
const T312_OCT25: { bedrooms: number; rentCol: number; gradeCol: number }[] = [
  { bedrooms: 0, rentCol: 3, gradeCol: 4 },
  { bedrooms: 1, rentCol: 7, gradeCol: 8 },
  { bedrooms: 2, rentCol: 11, gradeCol: 12 },
  { bedrooms: 3, rentCol: 15, gradeCol: 16 },
]

const shouldEmitCentreRowTable312 = (name: string): boolean => {
  const n = name.trim()
  if (!n || n.startsWith('§')) return false
  if (/^Quality|^Source|^©/i.test(n)) return false
  if (/^British Columbia\b/i.test(n)) return false
  if (/ CMAs$/i.test(n)) return false
  return (
    / CMA$/i.test(n) ||
    / CA$/i.test(n) ||
    / DM$/i.test(n) ||
    / RDA$/i.test(n) ||
    /\bZone\b/i.test(n)
  )
}

const simplifyCityName312 = (name: string): string =>
  name
    .replace(/\s+CMA\s*$/i, '')
    .replace(/\s+CA\s*$/i, '')
    .replace(/\s+DM\s*$/i, '')
    .replace(/\s+RDA\s*$/i, '')
    .trim()

export const ingestTable312FromRows = (
  rows: unknown[][],
  surveyYear: number,
  provinceCode: string,
): CmhcRentRow[] => {
  const prov = provinceCode.trim().toUpperCase()
  const out: CmhcRentRow[] = []

  for (const row of rows) {
    const rawName = row[0]
    if (typeof rawName !== 'string') continue
    const name = rawName.trim()
    if (!name) continue
    if (!shouldEmitCentreRowTable312(name)) continue

    const city = simplifyCityName312(name)
    for (const { bedrooms, rentCol, gradeCol } of T312_OCT25) {
      const { value } = parseMoneyCell(row[rentCol])
      if (value === null) continue
      const g = parseQualityLetter(row[gradeCol])
      out.push({
        province: prov,
        city,
        bedrooms,
        structureType: STRUCTURE_TOWNHOUSE_APARTMENT_COMBINED,
        avgRent: Math.round(value),
        surveyYear,
        ...(g ? { rentQualityGrade: g } : {}),
      })
    }
  }

  return sortCmhcRentRows(out)
}

export const sortCmhcRentRows = (rows: CmhcRentRow[]): CmhcRentRow[] => {
  return [...rows].sort((a, b) => {
    const pc = a.province.localeCompare(b.province)
    if (pc !== 0) return pc
    const cc = a.city.localeCompare(b.city)
    if (cc !== 0) return cc
    const st = a.structureType.localeCompare(b.structureType)
    if (st !== 0) return st
    return a.bedrooms - b.bedrooms
  })
}

export type CmhcRentRowKey = string

export const cmhcRentRowKey = (r: CmhcRentRow): CmhcRentRowKey =>
  `${r.province}|${r.city}|${r.bedrooms}|${r.structureType}`

/**
 * Later catalog entries overwrite earlier rows with the same key (regional after national wins when same structureType).
 */
export const mergeCmhcRentRows = (
  base: CmhcRentRow[],
  incoming: CmhcRentRow[],
  onConflict?: (key: CmhcRentRowKey, previous: CmhcRentRow, next: CmhcRentRow) => void,
): CmhcRentRow[] => {
  const map = new Map<CmhcRentRowKey, CmhcRentRow>()
  for (const r of base) {
    map.set(cmhcRentRowKey(r), r)
  }
  for (const r of incoming) {
    const k = cmhcRentRowKey(r)
    const prev = map.get(k)
    if (prev && onConflict) onConflict(k, prev, r)
    map.set(k, r)
  }
  return sortCmhcRentRows([...map.values()])
}

export const ingestFromSheetRows = (
  rows: unknown[][],
  surveyYear: number,
  profile: CmhcIngestProfile,
  provinceCode?: string,
): CmhcRentRow[] => {
  if (profile === 'rms-table-60-purpose-built') {
    return ingestTable60FromRows(rows, surveyYear)
  }
  const prov = provinceCode?.trim()
  if (!prov) {
    throw new Error('Table 3.1.2 ingest requires provinceCode (e.g. BC).')
  }
  return ingestTable312FromRows(rows, surveyYear, prov)
}
