/**
 * Node ingest: canonical utility rows + optional public/data/utility-canonical-snapshot.json
 * Run: npm run utility:ingest
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { utilityIngestorConfigSchema, canonicalUtilityRowSchema, type CanonicalUtilityRow } from '../src/lib/utilityIngest/schemas'
import { fetchHqProductionElectricity, toCanonicalHqProductionRows } from '../src/lib/utilityIngest/hqOds'
import {
  fetchCkanPackageShow,
  pickCsvResourceUrl,
  parseAlbertaEnergyPricesCsv,
  latestNatGasAlbertaGj,
} from '../src/lib/utilityIngest/ckanOpenCanada'
import { fetchOebBillDataXml, parseOebBillDataXml, summarizeOebOntarioResidentialElectricity } from '../src/lib/utilityIngest/oebBillData'
import { fetchOpenEiUtilityRatesIfKey } from '../src/lib/utilityIngest/openEi'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const CONFIG_PATH = path.join(ROOT, 'data', 'utility-ingestor', 'canada-utility-data-ingestor.json')
const OUT_PATH = path.join(ROOT, 'public', 'data', 'utility-canonical-snapshot.json')

const main = async () => {
  const raw: unknown = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'))
  const config = utilityIngestorConfigSchema.parse(raw)

  const rows: CanonicalUtilityRow[] = []
  const errors: string[] = []

  try {
    const xml = await fetchOebBillDataXml()
    const oebRows = parseOebBillDataXml(xml)
    const summary = summarizeOebOntarioResidentialElectricity(oebRows)
    if (summary) {
      rows.push({
        source_provider: 'Ontario Energy Board (OEB)',
        utility_type: 'electricity',
        region: 'ON',
        effective_date: new Date().toISOString().slice(0, 10),
        unit_cost_cad: summary.meanNetPerKwh,
        fixed_monthly_fee: summary.meanServiceCharge,
        currency: 'CAD',
        unit_of_measure: 'CAD_per_kWh_net_mean;CAD_per_month_SC_mean',
        notes: `Residential distributors n=${summary.count}`,
      })
    }
  } catch (e) {
    errors.push(`OEB: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const hq = await fetchHqProductionElectricity()
    rows.push(...toCanonicalHqProductionRows(hq))
  } catch (e) {
    errors.push(`Hydro-Québec: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const ckanId = (raw as { data_sources?: { ckan_package_id?: string }[] }).data_sources?.find(
      (s) => typeof s.ckan_package_id === 'string',
    )?.ckan_package_id
    const id = ckanId ?? '6dc97b50-5bbb-482d-8dd5-c9b23cd770dc'
    const show = await fetchCkanPackageShow(id)
    const csvUrl = pickCsvResourceUrl(show.result?.resources)
    if (csvUrl) {
      const res = await fetch(csvUrl)
      if (res.ok) {
        const text = await res.text()
        const parsed = parseAlbertaEnergyPricesCsv(text)
        const gas = latestNatGasAlbertaGj(parsed)
        if (gas) {
          rows.push({
            source_provider: 'Government of Alberta (open.canada.ca)',
            utility_type: 'natural_gas',
            region: 'AB',
            effective_date: gas.effective_date,
            unit_cost_cad: gas.unit_cost_cad,
            fixed_monthly_fee: null,
            currency: 'CAD',
            unit_of_measure: 'CAD_per_GJ',
            notes: 'Benchmark from Alberta Energy Prices CSV (NatGas series).',
          })
        }
      }
    }
  } catch (e) {
    errors.push(`CKAN: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const key = process.env.OPENEI_API_KEY
    const openei = await fetchOpenEiUtilityRatesIfKey(key)
    if (openei) rows.push(...openei)
  } catch (e) {
    errors.push(`OpenEI: ${e instanceof Error ? e.message : String(e)}`)
  }

  for (const row of rows) {
    canonicalUtilityRowSchema.parse(row)
  }

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true })
  await fs.writeFile(
    OUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        configVersion: config.version,
        rowCount: rows.length,
        errors,
        rows,
      },
      null,
      2,
    ),
    'utf8',
  )

  console.log(`Wrote ${rows.length} canonical row(s) to ${path.relative(ROOT, OUT_PATH)}`)
  if (errors.length) {
    console.warn('Non-fatal source errors:', errors.join('; '))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
