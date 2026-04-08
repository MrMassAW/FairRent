/**
 * Builds public/data/historical-rents-db.json from bundled CMHC rows and checks every URL in sourcesRegistry.
 * Run: npm run data:weekly-update
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { getAllVerificationUrls } from '../src/lib/sourcesRegistry'
import { fetchWdsZipCsvText } from '../src/lib/statcanWds'
import { ingestStatcan46100092AskingRents } from '../src/lib/statcanRentIngest'

const ROOT = process.cwd()
const INPUT_RENTS = path.join(ROOT, 'public', 'data', 'cmhc-rents.json')
const OUTPUT_DB = path.join(ROOT, 'public', 'data', 'historical-rents-db.json')

const TIMEOUT_MS = 20_000

const tryHead = async (url: string): Promise<Response | null> => {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal })
    clearTimeout(t)
    return res
  } catch {
    return null
  }
}

const tryGet = async (url: string): Promise<Response | null> => {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal })
    clearTimeout(t)
    return res
  } catch {
    return null
  }
}

const verifyOne = async (url: string): Promise<boolean> => {
  const head = await tryHead(url)
  if (head?.ok) {
    return true
  }
  const get = await tryGet(url)
  return Boolean(get?.ok)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const monthKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`

const buildPastMonths = (count: number) => {
  const now = new Date()
  const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const months: string[] = []
  for (let i = 0; i < count; i += 1) {
    months.push(monthKey(new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1))))
  }
  return months.reverse()
}

type CmhcInputRow = { surveyYear: number; province: string; city: string; bedrooms: number; avgRent: number }

const buildHistoryRows = (rows: CmhcInputRow[]) => {
  const latestYear = Math.max(...rows.map((row) => row.surveyYear))
  const latestRows = rows.filter((row) => row.surveyYear === latestYear)
  const months = buildPastMonths(24)
  return months.flatMap((month) => {
    const year = Number(month.slice(0, 4))
    return latestRows.map((row) => ({
      id: `${month}|${row.province}|${row.city}|${row.bedrooms}`,
      month,
      province: row.province,
      cma: row.city,
      bedrooms: row.bedrooms,
      avg_rent: row.avgRent,
      source_date: `${row.surveyYear}-12-31`,
      source: 'CMHC' as const,
      quality: year === latestYear ? ('verified' as const) : ('carried-forward' as const),
    }))
  })
}

async function weeklyUpdate() {
  const raw = await fs.readFile(INPUT_RENTS, 'utf-8')
  const cmhcRows = JSON.parse(raw) as CmhcInputRow[]
  const rents_by_cma = buildHistoryRows(cmhcRows)

  // StatCan quarterly asking rents (46-10-0092-01 → WDS id 46100092)
  let statcan_asking_rents_quarterly: unknown[] = []
  try {
    const citiesByProvince: Record<string, string[]> = {}
    cmhcRows.forEach((r) => {
      const p = r.province.trim().toUpperCase()
      if (!citiesByProvince[p]) citiesByProvince[p] = []
      if (!citiesByProvince[p].includes(r.city)) citiesByProvince[p].push(r.city)
    })
    const csvText = await fetchWdsZipCsvText('46100092', 'en')
    statcan_asking_rents_quarterly = ingestStatcan46100092AskingRents({
      csvText,
      cmhcCitiesByProvince: citiesByProvince,
      fetchedAt: new Date().toISOString(),
    })
  } catch {
    statcan_asking_rents_quarterly = []
  }

  const registryUrls = getAllVerificationUrls()
  const checkResults = await Promise.all(
    registryUrls.map(async (url) => ({ url, ok: await verifyOne(url) })),
  )
  const failed = checkResults.filter((r) => !r.ok).map((r) => r.url)

  await sleep(50)

  const dbPayload = {
    generated_at: new Date().toISOString(),
    market_reference_blend: {
      policy: 'runtime',
      cmhc: 'annual average rent (CMHC RMS)',
      statcan: 'quarterly asking rent (StatCan 46-10-0092-01)',
      note: 'Monthly rent table is CMHC-only; the public calculator blends CMHC+StatCan at runtime when StatCan rows exist.',
    },
    source_registry_checks: {
      registry_url_count: registryUrls.length,
      ok_count: checkResults.filter((r) => r.ok).length,
      failed_urls: failed,
      details: checkResults,
    },
    rents_by_cma,
    statcan_asking_rents_quarterly,
  }

  await fs.writeFile(OUTPUT_DB, `${JSON.stringify(dbPayload, null, 2)}\n`, 'utf-8')
  console.log(
    `Weekly update complete. Rows: ${rents_by_cma.length}. Registry URLs: ${registryUrls.length} (${failed.length} failed).`,
  )
  if (failed.length > 0) {
    console.error('Failed URLs:', failed.join('\n'))
    process.exitCode = 1
  }
}

await weeklyUpdate()
