/**
 * Build server/data/canadaPlaces.json + public/data/canadaPlaces.json from:
 * - SGC 2021 municipality names (via existing canadaGeo.json)
 * - GeoNames CA populated places (CC-BY 4.0): https://download.geonames.org/export/dump/CA.zip
 * - GeoNames CA postal points (CC-BY 4.0): https://download.geonames.org/export/zip/CA_full.csv.zip
 *
 * Then enrich src/data/cmhc-rents.json with lat/lng per row (municipality match on CMHC city label).
 *
 * Run: npm run data:canada-places
 */
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import JSZip from 'jszip'

import type {
  CanadaPlaceFsa,
  CanadaPlaceMunicipality,
  CanadaPlacesDataset,
} from '../src/types/canadaPlaces'
import type { CanadaGeoDataset } from '../server/lib/canadaGeoTypes'
import type { CmhcRentRow } from '../src/data/cmhcRents'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const GEONAMES_CA_ZIP = 'https://download.geonames.org/export/dump/CA.zip'
const GEONAMES_CA_POSTAL_ZIP = 'https://download.geonames.org/export/zip/CA_full.csv.zip'

/** GeoNames numeric admin1 → two-letter province/territory code */
const GEONAMES_CA_ADMIN1_TO_PROVINCE: Record<string, string> = {
  '01': 'AB',
  '02': 'BC',
  '03': 'MB',
  '04': 'NB',
  '05': 'NL',
  '07': 'NS',
  '08': 'ON',
  '09': 'PE',
  '10': 'QC',
  '11': 'SK',
  '12': 'YT',
  '13': 'NT',
  '14': 'NU',
}

const CA_PROVINCE_CODES = new Set(Object.values(GEONAMES_CA_ADMIN1_TO_PROVINCE))

const USER_AGENT = 'FairRentDataScript/1.0 (https://github.com/)'

const normalizeKey = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')

const normalizeCityToken = (value: string) => normalizeKey(value).replace(/[^a-z0-9]/g, '')

const levenshteinDistance = (a: string, b: string): number => {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const prev = Array.from({ length: b.length + 1 }, (_, idx) => idx)
  const curr = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j]
  }
  return prev[b.length]
}

type GeoHit = { lat: number; lng: number; pop: number; geonamesName: string }

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  let last: Error | null = null
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
      if (!res.ok) {
        throw new Error(`GET ${url} → HTTP ${res.status}`)
      }
      return res.arrayBuffer()
    } catch (e) {
      last = e instanceof Error ? e : new Error(String(e))
      if (attempt < 4) await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }
  throw last ?? new Error('fetch failed')
}

function parseGeonamesCa(caText: string): Map<string, GeoHit> {
  /** `${province}|${normalizeKey(name)}` → best by population */
  const best = new Map<string, GeoHit>()

  const consider = (prov: string, rawName: string, lat: number, lng: number, pop: number, geonamesName: string) => {
    if (!rawName.trim()) return
    const k = normalizeKey(rawName)
    if (!k) return
    const mapKey = `${prov}|${k}`
    const hit: GeoHit = { lat, lng, pop, geonamesName }
    const cur = best.get(mapKey)
    if (!cur || pop > cur.pop) best.set(mapKey, hit)
  }

  for (const line of caText.split(/\r?\n/)) {
    if (!line.trim()) continue
    const f = line.split('\t')
    if (f.length < 15) continue
    if (f[8] !== 'CA') continue
    if (f[6] !== 'P') continue
    const prov = GEONAMES_CA_ADMIN1_TO_PROVINCE[f[10] ?? '']
    if (!prov) continue
    const lat = Number(f[4])
    const lng = Number(f[5])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const pop = Number(f[14]) || 0
    const asciiname = f[2] ?? ''
    const name = f[1] ?? ''
    consider(prov, asciiname, lat, lng, pop, name)
    consider(prov, name, lat, lng, pop, name)
    const alts = (f[3] ?? '').split(',')
    for (const a of alts) {
      if (a.trim()) consider(prov, a.trim(), lat, lng, pop, name)
    }
  }

  return best
}

function matchMunicipality(
  province: string,
  sgcName: string,
  geoIndex: Map<string, GeoHit>,
): GeoHit | null {
  const prov = province.trim().toUpperCase()
  const n = normalizeKey(sgcName)
  const direct = geoIndex.get(`${prov}|${n}`)
  if (direct) return direct

  const variants = [
    n,
    normalizeKey(sgcName.replace(/\bSt\.\b/gi, 'Saint')),
    normalizeKey(sgcName.replace(/\bSaint\b/gi, 'St.')),
  ]
  for (const v of variants) {
    const hit = geoIndex.get(`${prov}|${v}`)
    if (hit) return hit
  }

  const token = normalizeCityToken(sgcName)
  if (!token) return null
  let bestHit: GeoHit | null = null
  let bestDist = Infinity
  for (const [key, hit] of geoIndex) {
    if (!key.startsWith(`${prov}|`)) continue
    const namePart = key.slice(prov.length + 1)
    const candidateToken = normalizeCityToken(namePart)
    if (!candidateToken) continue
    const d = levenshteinDistance(token, candidateToken)
    const maxLen = Math.max(1, token.length, candidateToken.length)
    const score = 1 - d / maxLen
    if ((score >= 0.5 || d <= 3) && d < bestDist) {
      bestDist = d
      bestHit = hit
    }
  }
  return bestHit
}

function parsePostalText(text: string): CanadaPlaceFsa[] {
  /** `${prov}|${fsa}` → aggregates */
  const agg = new Map<string, { sumLat: number; sumLng: number; n: number; label: string }>()
  const fsaRe = /^[A-Za-z]\d[A-Za-z]$/

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const f = line.split('\t')
    if (f.length < 11) continue
    if (f[0] !== 'CA') continue
    const rawPostal = (f[1] ?? '').replace(/\s+/g, '').toUpperCase()
    if (rawPostal.length < 3) continue
    const fsa = rawPostal.slice(0, 3)
    if (!fsaRe.test(fsa)) continue
    const admin1 = (f[4] ?? '').trim().toUpperCase()
    const prov =
      admin1.length === 2 && CA_PROVINCE_CODES.has(admin1)
        ? admin1
        : (GEONAMES_CA_ADMIN1_TO_PROVINCE[admin1] ?? '')
    if (!prov) continue
    const lat = Number(f[9])
    const lng = Number(f[10])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const label = (f[2] ?? '').trim() || fsa
    const key = `${prov}|${fsa}`
    const cur = agg.get(key)
    if (cur) {
      cur.sumLat += lat
      cur.sumLng += lng
      cur.n += 1
    } else {
      agg.set(key, { sumLat: lat, sumLng: lng, n: 1, label })
    }
  }

  const out: CanadaPlaceFsa[] = []
  for (const [key, v] of agg) {
    const pipe = key.indexOf('|')
    const province = key.slice(0, pipe)
    const fsa = key.slice(pipe + 1)
    out.push({
      province,
      fsa,
      lat: v.sumLat / v.n,
      lng: v.sumLng / v.n,
      label: v.label,
    })
  }
  out.sort((a, b) => (a.province !== b.province ? a.province.localeCompare(b.province) : a.fsa.localeCompare(b.fsa)))
  return out
}

function matchCmhcCityToMunicipality(
  province: string,
  cmhcCity: string,
  municipalities: CanadaPlaceMunicipality[],
): CanadaPlaceMunicipality | null {
  const prov = province.trim().toUpperCase()
  const inProv = municipalities.filter((m) => m.province === prov)
  const n = normalizeKey(cmhcCity)
  const exact = inProv.find((m) => normalizeKey(m.name) === n)
  if (exact) return exact

  const token = normalizeCityToken(cmhcCity)
  let best: CanadaPlaceMunicipality | null = null
  let bestDist = Infinity
  for (const m of inProv) {
    const ct = normalizeCityToken(m.name)
    if (!ct) continue
    const d = levenshteinDistance(token, ct)
    const maxLen = Math.max(1, token.length, ct.length)
    const score = 1 - d / maxLen
    if ((score >= 0.45 || d <= 4) && d < bestDist) {
      bestDist = d
      best = m
    }
  }
  return best
}

async function main() {
  const geoPath = join(root, 'server', 'data', 'canadaGeo.json')
  const geoRaw = readFileSync(geoPath, 'utf8')
  const canadaGeo = JSON.parse(geoRaw) as CanadaGeoDataset

  console.log('Downloading GeoNames CA.zip …')
  const caZipBuf = await fetchBuffer(GEONAMES_CA_ZIP)
  const caZip = await JSZip.loadAsync(caZipBuf)
  const caFile = caZip.file('CA.txt')
  if (!caFile) throw new Error('CA.zip missing CA.txt')
  const caText = await caFile.async('string')
  const geoIndex = parseGeonamesCa(caText)
  console.log(`GeoNames CA keys: ${geoIndex.size}`)

  const municipalities: CanadaPlaceMunicipality[] = []
  let matched = 0
  let unmatched = 0
  for (const [province, names] of Object.entries(canadaGeo.municipalitiesByProvince)) {
    for (const name of names) {
      const hit = matchMunicipality(province, name, geoIndex)
      if (hit) {
        matched += 1
        municipalities.push({
          province,
          name,
          lat: hit.lat,
          lng: hit.lng,
          ...(hit.geonamesName !== name ? { geonamesMatch: hit.geonamesName } : {}),
        })
      } else {
        unmatched += 1
      }
    }
  }
  municipalities.sort((a, b) =>
    a.province !== b.province ? a.province.localeCompare(b.province) : a.name.localeCompare(b.name, 'en-CA'),
  )
  console.log(`Municipalities matched: ${matched}, unmatched: ${unmatched}`)

  console.log('Downloading GeoNames CA_full.csv.zip …')
  const postalZipBuf = await fetchBuffer(GEONAMES_CA_POSTAL_ZIP)
  const postalZip = await JSZip.loadAsync(postalZipBuf)
  const postalEntry = postalZip.file('CA_full.txt') ?? postalZip.file(/CA_full/i)?.[0]
  if (!postalEntry) throw new Error('CA_full.csv.zip: expected CA_full.txt')
  const postalText = await postalEntry.async('string')
  const fsas = parsePostalText(postalText)
  console.log(`FSA rows: ${fsas.length}`)

  const dataset: CanadaPlacesDataset = {
    source: `${GEONAMES_CA_ZIP} + ${GEONAMES_CA_POSTAL_ZIP}; municipality names from ${canadaGeo.source}`,
    generatedNote:
      'Municipality coordinates matched from GeoNames populated places (P) to SGC 2021 subdivision names. FSA centroids averaged from GeoNames postal points. GeoNames: Creative Commons Attribution 4.0 License.',
    generatedAt: new Date().toISOString(),
    municipalities,
    fsas,
  }

  const outServer = join(root, 'server', 'data', 'canadaPlaces.json')
  const outPublic = join(root, 'public', 'data', 'canadaPlaces.json')
  await mkdir(dirname(outServer), { recursive: true })
  await mkdir(dirname(outPublic), { recursive: true })
  const json = `${JSON.stringify(dataset)}\n`
  await writeFile(outServer, json, 'utf8')
  await writeFile(outPublic, json, 'utf8')
  console.log(`Wrote ${outServer}`)
  console.log(`Wrote ${outPublic}`)

  const rentsPath = join(root, 'src', 'data', 'cmhc-rents.json')
  const rentsRaw = readFileSync(rentsPath, 'utf8')
  const rents = JSON.parse(rentsRaw) as CmhcRentRow[]
  let enriched = 0
  const withGeo = rents.map((row) => {
    const m = matchCmhcCityToMunicipality(row.province, row.city, municipalities)
    if (m) {
      enriched += 1
      return { ...row, lat: m.lat, lng: m.lng }
    }
    return { ...row }
  })
  await writeFile(rentsPath, `${JSON.stringify(withGeo, null, 2)}\n`, 'utf8')
  console.log(`Enriched CMHC rows with coordinates: ${enriched} / ${rents.length} (${rentsPath})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
