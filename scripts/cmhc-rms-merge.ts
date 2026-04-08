/**
 * Merge CMHC RMS workbooks listed in public/data/cmhc-rms-workbooks-{year}.json into cmhc-rents.json.
 *
 *   npx tsx scripts/cmhc-rms-merge.ts
 *   npx tsx scripts/cmhc-rms-merge.ts --year 2025
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import type { CmhcRentRow } from '../src/data/cmhcRents'
import type { CmhcRmsWorkbookCatalogEntry } from '../src/lib/cmhcRmsWorkbookCatalog'
import { ingestFromSheetRows, mergeCmhcRentRows } from '../src/lib/cmhcRmsParse'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const DEFAULT_YEAR = 2025

const parseArgs = (): { year: number } => {
  let year = DEFAULT_YEAR
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--year' && argv[i + 1]) {
      year = Number(argv[i + 1])
      i += 1
    } else if (a.startsWith('--year=')) {
      year = Number(a.slice('--year='.length))
    }
  }
  return { year }
}

async function main() {
  const { year } = parseArgs()
  const catalogPath = path.join(ROOT, 'public', 'data', `cmhc-rms-workbooks-${year}.json`)
  const raw = await fs.readFile(catalogPath, 'utf8')
  const catalog = JSON.parse(raw) as CmhcRmsWorkbookCatalogEntry[]
  if (!Array.isArray(catalog) || catalog.length === 0) {
    throw new Error(`Invalid catalog: ${catalogPath}`)
  }

  let master: CmhcRentRow[] = []

  for (const entry of catalog) {
    console.log(`Fetching ${entry.label}…`)
    const res = await fetch(entry.url)
    if (!res.ok) throw new Error(`HTTP ${res.status} ${entry.url}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer' })
    if (!wb.SheetNames.includes(entry.defaultSheet)) {
      throw new Error(`Missing sheet "${entry.defaultSheet}" in ${entry.label}. Found: ${wb.SheetNames.join(', ')}`)
    }
    const sheet = wb.Sheets[entry.defaultSheet]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]
    const rowsOut = ingestFromSheetRows(rows, year, entry.ingestProfile, entry.provinceCode)
    console.log(`  ${rowsOut.length} rows from ${entry.defaultSheet}`)
    master = mergeCmhcRentRows(master, rowsOut)
  }

  const jsonPathSrc = path.join(ROOT, 'src', 'data', 'cmhc-rents.json')
  const jsonPathPublic = path.join(ROOT, 'public', 'data', 'cmhc-rents.json')
  const payload = `${JSON.stringify(master, null, 2)}\n`
  await fs.writeFile(jsonPathSrc, payload, 'utf8')
  await fs.writeFile(jsonPathPublic, payload, 'utf8')
  console.log(`Wrote ${master.length} merged rows to:\n  ${jsonPathSrc}\n  ${jsonPathPublic}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
