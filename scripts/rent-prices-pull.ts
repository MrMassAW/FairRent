/**
 * Sequentially pulls rental-price related upstream files from the web (one-by-one),
 * and refreshes the app's bundled CMHC rent rows (`src/data/cmhc-rents.json` + `public/data/cmhc-rents.json`).
 *
 * Run:
 *   npx tsx scripts/rent-prices-pull.ts --year 2025
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { downloadCmhcRmsWorkbook, extractCmhcRmsRents } from './cmhc-rms-ingest'
import { fetchWdsZipCsvText } from '../src/lib/statcanWds'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const DEFAULT_YEAR = 2025

const parseArgs = (): { year: number } => {
  let year = DEFAULT_YEAR
  const argv = process.argv.slice(2)
  for (const a of argv) {
    if (a.startsWith('--year=')) year = Number(a.slice('--year='.length))
  }
  const idx = argv.indexOf('--year')
  if (idx >= 0 && argv[idx + 1]) year = Number(argv[idx + 1])
  return { year }
}

const ensureDir = async (p: string) => {
  await fs.mkdir(p, { recursive: true })
}

const writeBinary = async (outPath: string, buf: Buffer) => {
  await ensureDir(path.dirname(outPath))
  await fs.writeFile(outPath, buf)
}

const writeText = async (outPath: string, text: string) => {
  await ensureDir(path.dirname(outPath))
  await fs.writeFile(outPath, text, 'utf8')
}

const fetchBinary = async (url: string): Promise<Buffer> => {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

const CMHC_PERCENTILES_2025 =
  'https://assets.cmhc-schl.gc.ca/sites/cmhc/professional/housing-markets-data-and-research/housing-data-tables/rental-market/percentile-rents-urban-centres-pooled-small-centre-rental-market/percentile-rents-urban-centres-pooled-small-centre-rental-market-2025-en.xlsx'

const CMHC_RMS_MAIN =
  'https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-data/data-tables/rental-market/rental-market-report-data-tables'

const CMHC_RURAL_MAIN =
  'https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-data/data-tables/rental-market/rural-rental-market-survey-data-average-rent-centre'

async function main() {
  const { year } = parseArgs()

  const rawDir = path.join(ROOT, 'data', 'raw', 'rents')
  await ensureDir(rawDir)

  console.log('Rental prices: pulling sources sequentially (one-by-one).')

  // 1) CMHC RMS National workbook → refresh processed JSON used by app.
  console.log(`1/5 CMHC RMS National Excel (${year})`)
  const cmhcBuf = await downloadCmhcRmsWorkbook(year)
  await writeBinary(path.join(rawDir, `cmhc-rms-rmr-canada-${year}-en.xlsx`), cmhcBuf)
  const extracted = extractCmhcRmsRents(cmhcBuf, year)
  const rentsPayload = `${JSON.stringify(extracted, null, 2)}\n`
  await writeText(path.join(ROOT, 'src', 'data', 'cmhc-rents.json'), rentsPayload)
  await writeText(path.join(ROOT, 'public', 'data', 'cmhc-rents.json'), rentsPayload)

  // 2) CMHC Percentile rents workbook (example direct file for 2025).
  console.log('2/5 CMHC Percentile rents Excel (2025)')
  const pctBuf = await fetchBinary(CMHC_PERCENTILES_2025)
  await writeBinary(path.join(rawDir, 'cmhc-percentile-rents-2025-en.xlsx'), pctBuf)

  // 3) CMHC Rural RMS main page (HTML snapshot only; Excel download links are on page).
  console.log('3/5 CMHC Rural Rental Market Survey page (HTML snapshot)')
  const ruralHtml = await fetch(CMHC_RURAL_MAIN, { redirect: 'follow' }).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} ${CMHC_RURAL_MAIN}`)
    return r.text()
  })
  await writeText(path.join(rawDir, 'cmhc-rural-rental-market-survey-page.html'), ruralHtml)

  // 4) StatCan republished CMHC RMS table (pid 3410013301 → WDS id 34100133).
  console.log('4/5 StatCan table 34-10-0133-01 (CSV via WDS)')
  const statcan34100133 = await fetchWdsZipCsvText('34100133', 'en')
  await writeText(path.join(rawDir, 'statcan-34100133.csv'), statcan34100133)

  // 5) StatCan quarterly asking rents (pid 4610009201 → WDS id 46100092).
  console.log('5/5 StatCan table 46-10-0092-01 (CSV via WDS)')
  const statcan46100092 = await fetchWdsZipCsvText('46100092', 'en')
  await writeText(path.join(rawDir, 'statcan-46100092.csv'), statcan46100092)

  // Registry pages (optional snapshots for traceability)
  const cmhcRmsPage = await fetch(CMHC_RMS_MAIN, { redirect: 'follow' }).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} ${CMHC_RMS_MAIN}`)
    return r.text()
  })
  await writeText(path.join(rawDir, 'cmhc-rms-main-page.html'), cmhcRmsPage)

  console.log(`Done. Updated bundled CMHC rents: ${extracted.length} row(s). Raw downloads in ${path.relative(ROOT, rawDir)}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

