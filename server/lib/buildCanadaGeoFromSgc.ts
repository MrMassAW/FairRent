/**
 * Build province + municipality lists from Statistics Canada SGC 2021 structure CSV.
 * Source: https://open.canada.ca/data/dataset/1d815243-28ce-45e6-ad6b-58643327a253
 * File: sgc-cgt-2021-structure-eng.csv
 */

import type { CanadaGeoDataset, CanadaProvinceEntry } from './canadaGeoTypes'

export const SGC_STRUCTURE_CSV_URL =
  'https://www.statcan.gc.ca/eng/statistical-programs/document/sgc-cgt-2021-structure-eng.csv'

/** SGC numeric province/territory code (first two digits of CSD code) → display */
export const SGC_TO_PROVINCE: Record<string, { code: string; name: string }> = {
  '10': { code: 'NL', name: 'Newfoundland and Labrador' },
  '11': { code: 'PE', name: 'Prince Edward Island' },
  '12': { code: 'NS', name: 'Nova Scotia' },
  '13': { code: 'NB', name: 'New Brunswick' },
  '24': { code: 'QC', name: 'Quebec' },
  '35': { code: 'ON', name: 'Ontario' },
  '46': { code: 'MB', name: 'Manitoba' },
  '47': { code: 'SK', name: 'Saskatchewan' },
  '48': { code: 'AB', name: 'Alberta' },
  '59': { code: 'BC', name: 'British Columbia' },
  '60': { code: 'YT', name: 'Yukon' },
  '61': { code: 'NT', name: 'Northwest Territories' },
  '62': { code: 'NU', name: 'Nunavut' },
}

export type { CanadaGeoDataset, CanadaProvinceEntry }

/** Parse one CSV line with RFC4180-style quoted fields */
export function parseCsvRow(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cur += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out
}

/** Split into logical CSV rows; merges lines when a quoted field contains newlines */
function splitCsvLines(text: string): string[] {
  const raw = text.split(/\r?\n/)
  const lines: string[] = []
  let buf = ''
  for (const part of raw) {
    buf = buf ? `${buf}\n${part}` : part
    const quoteCount = (buf.match(/"/g) ?? []).length
    if (quoteCount % 2 === 0) {
      lines.push(buf)
      buf = ''
    }
  }
  if (buf.length > 0) lines.push(buf)
  return lines.filter((l) => l.trim().length > 0)
}

const CSD_LABEL = 'Census subdivision'

/**
 * Build dataset from raw SGC structure CSV text (UTF-8).
 */
export function buildCanadaGeoDatasetFromSgcStructureCsv(csvText: string, source = SGC_STRUCTURE_CSV_URL): CanadaGeoDataset {
  const stripped = csvText.replace(/^\uFEFF/, '')
  const lines = splitCsvLines(stripped)
  if (lines.length < 2) {
    throw new Error('SGC structure CSV: empty or invalid')
  }

  const provinces: CanadaProvinceEntry[] = []
  const municipalitySets: Record<string, Set<string>> = {}

  for (const key of Object.values(SGC_TO_PROVINCE)) {
    municipalitySets[key.code] = new Set()
  }

  for (let li = 1; li < lines.length; li += 1) {
    const row = parseCsvRow(lines[li])
    if (row.length < 4) continue

    const level = row[0].trim()
    const hierarchy = row[1].trim()
    const code = row[2].trim()
    const classTitle = row[3].trim()

    if (level === '2' && hierarchy === 'Province and territory') {
      const meta = SGC_TO_PROVINCE[code]
      if (meta) {
        provinces.push({ sgc: code, code: meta.code, name: classTitle || meta.name })
      }
    }

    if (level === '4' && hierarchy === CSD_LABEL && /^\d+$/.test(code) && code.length >= 2) {
      const sgcProv = code.slice(0, 2)
      const meta = SGC_TO_PROVINCE[sgcProv]
      if (!meta || !classTitle) continue
      municipalitySets[meta.code]!.add(classTitle)
    }
  }

  provinces.sort((a, b) => a.sgc.localeCompare(b.sgc, undefined, { numeric: true }))

  const municipalitiesByProvince: Record<string, string[]> = {}
  for (const p of provinces) {
    const names = Array.from(municipalitySets[p.code] ?? []).sort((a, b) => a.localeCompare(b, 'en-CA', { sensitivity: 'base' }))
    municipalitiesByProvince[p.code] = names
  }

  return {
    source,
    generatedNote: 'Built from SGC 2021 structure CSV (Census subdivisions = municipalities / equivalent).',
    provinces,
    municipalitiesByProvince,
  }
}
