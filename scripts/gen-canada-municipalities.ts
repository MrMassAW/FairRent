/**
 * Download SGC 2021 structure CSV and write server/data/canadaGeo.json
 * Run: npm run data:canada-geo
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SGC_STRUCTURE_CSV_URL,
  buildCanadaGeoDatasetFromSgcStructureCsv,
} from '../server/lib/buildCanadaGeoFromSgc'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outPath = join(__dirname, '..', 'server', 'data', 'canadaGeo.json')

async function main() {
  const res = await fetch(SGC_STRUCTURE_CSV_URL, {
    headers: { 'User-Agent': 'FairRentDataScript/1.0' },
  })
  if (!res.ok) {
    throw new Error(`Failed to download SGC CSV: HTTP ${res.status}`)
  }
  const csvText = new TextDecoder('utf-8').decode(new Uint8Array(await res.arrayBuffer()))
  const dataset = buildCanadaGeoDatasetFromSgcStructureCsv(csvText, SGC_STRUCTURE_CSV_URL)
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(dataset, null, 0)}\n`, 'utf8')

  let total = 0
  for (const names of Object.values(dataset.municipalitiesByProvince)) {
    total += names.length
  }
  console.log(`Wrote ${outPath}`)
  console.log(`Provinces/territories: ${dataset.provinces.length}, subdivisions total: ${total}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
