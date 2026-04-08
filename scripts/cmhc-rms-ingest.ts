/**
 * Downloads CMHC's national Rental Market Survey Excel (or reads a local copy) and extracts
 * average rents from **Table 6.0** — non-turnover units, **October** columns (latest year in file),
 * for Studio + 1–3+ bedrooms. Rows are purpose-built private apartment structures (3+ units), matching
 * the app's `structureType: 'purpose-built'`.
 *
 * Usage:
 *   npx tsx scripts/cmhc-rms-ingest.ts
 *   npx tsx scripts/cmhc-rms-ingest.ts --input ./rmr-canada-2025-en.xlsx
 *   npx tsx scripts/cmhc-rms-ingest.ts --year 2025
 *
 * Writes:
 *   - src/data/cmhc-rents.json
 *   - public/data/cmhc-rents.json
 *
 * Source URL pattern (update year when CMHC publishes a new file):
 *   https://assets.cmhc-schl.gc.ca/.../rental-market-report-data-tables/{year}/rmr-canada-{year}-en.xlsx
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import type { CmhcRentRow } from '../src/data/cmhcRents'
import { ingestTable60FromRows } from '../src/lib/cmhcRmsParse'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const DEFAULT_YEAR = 2025

const DEFAULT_DOWNLOAD_URL = (year: number) =>
  `https://assets.cmhc-schl.gc.ca/sites/cmhc/professional/housing-markets-data-and-research/housing-data-tables/rental-market/rental-market-report-data-tables/${year}/rmr-canada-${year}-en.xlsx`

const parseArgs = (): { year: number; input?: string } => {
  let year = DEFAULT_YEAR
  let input: string | undefined
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--year' && argv[i + 1]) {
      year = Number(argv[i + 1])
      i += 1
    } else if (a === '--input' && argv[i + 1]) {
      input = argv[i + 1]
      i += 1
    } else if (a.startsWith('--year=')) {
      year = Number(a.slice('--year='.length))
    } else if (a.startsWith('--input=')) {
      input = a.slice('--input='.length)
    }
  }
  return { year, input }
}

export const downloadCmhcRmsWorkbook = async (year: number): Promise<Buffer> => {
  const url = DEFAULT_DOWNLOAD_URL(year)
  console.log(`Fetching ${url}`)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} — download failed. Try --input with a local rmr-canada-${year}-en.xlsx`)
  }
  return Buffer.from(await res.arrayBuffer())
}

export const extractCmhcRmsRents = (buffer: Buffer, surveyYear: number): CmhcRentRow[] => {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = 'Table 6.0'
  if (!wb.SheetNames.includes(sheetName)) {
    throw new Error(`Missing sheet "${sheetName}". Found: ${wb.SheetNames.join(', ')}`)
  }
  const sheet = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]
  const out = ingestTable60FromRows(rows, surveyYear)
  if (out.length === 0) {
    throw new Error('Extracted 0 rows from CMHC RMS sheet (unexpected format).')
  }
  return out
}

async function main() {
  const { year, input } = parseArgs()
  const surveyYear = year

  let buffer: Buffer
  if (input) {
    buffer = await fs.readFile(path.resolve(input))
  } else {
    buffer = await downloadCmhcRmsWorkbook(year)
  }

  const extracted = extractCmhcRmsRents(buffer, surveyYear)

  const jsonPathSrc = path.join(ROOT, 'src', 'data', 'cmhc-rents.json')
  const jsonPathPublic = path.join(ROOT, 'public', 'data', 'cmhc-rents.json')
  const payload = `${JSON.stringify(extracted, null, 2)}\n`
  await fs.writeFile(jsonPathSrc, payload, 'utf8')
  await fs.writeFile(jsonPathPublic, payload, 'utf8')

  console.log(`Wrote ${extracted.length} CMHC rent rows (${surveyYear}) to:`)
  console.log(`  ${jsonPathSrc}`)
  console.log(`  ${jsonPathPublic}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
