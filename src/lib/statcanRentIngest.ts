import type { StatcanAskingRentQuarterly } from '../types/adminData'
import { colIndex, parseStatCanCsv } from './statcanCsv'

const PROVINCE_NAME_TO_CODE: Record<string, string> = {
  'newfoundland and labrador': 'NL',
  'prince edward island': 'PE',
  'nova scotia': 'NS',
  'new brunswick': 'NB',
  quebec: 'QC',
  'québec': 'QC',
  ontario: 'ON',
  manitoba: 'MB',
  saskatchewan: 'SK',
  alberta: 'AB',
  'british columbia': 'BC',
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')

const normalizeCityToken = (s: string) => norm(s).replace(/[^a-z0-9]/g, '')

const parseBedrooms = (labelRaw: string): number | null => {
  const label = norm(labelRaw)
  if (!label) return null
  if (label.includes('bachelor') || label.includes('studio')) return 0
  if (label.includes('1') && label.includes('bed')) return 1
  if (label.includes('2') && label.includes('bed')) return 2
  if (label.includes('3') && label.includes('bed')) return 3
  if (label.includes('three') && label.includes('bed')) return 3
  // Variants like "3 bedrooms or more", "3+ bedrooms", "3 bedrooms and over".
  if (
    (label.includes('3') || label.includes('three')) &&
    (label.includes('+') || label.includes('or more') || label.includes('and over') || label.includes('or over')) &&
    label.includes('bed')
  ) {
    return 3
  }
  return null
}

const parseNumber = (value: string): number | null => {
  const s = value.trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const guessProvinceCodeFromGeo = (geoRaw: string): string | null => {
  const geo = geoRaw.trim()
  const m = geo.match(/,\s*([^,]+)\s*$/)
  if (!m?.[1]) return null
  const code = PROVINCE_NAME_TO_CODE[norm(m[1])]
  return code ?? null
}

const stripGeoToCity = (geoRaw: string): string => {
  // Examples vary by table; keep conservative transforms.
  return geoRaw
    .replace(/\s+CMA\s*$/i, '')
    .replace(/\s+CA\s*$/i, '')
    .replace(/,\s*[^,]+$/i, '') // drop trailing province name
    .trim()
}

const resolveCmhcCityForGeo = (geo: string, candidates: readonly string[]): string | null => {
  if (candidates.length === 0) return null
  const geoCity = stripGeoToCity(geo)

  const exact = candidates.find((c) => norm(c) === norm(geoCity))
  if (exact) return exact

  const geoToken = normalizeCityToken(geoCity)
  if (!geoToken) return null

  const ranked = candidates
    .map((c) => {
      const tok = normalizeCityToken(c)
      const score =
        tok === geoToken ? 1 : tok.includes(geoToken) || geoToken.includes(tok) ? 0.9 : 0
      return { c, score }
    })
    .sort((a, b) => b.score - a.score || a.c.localeCompare(b.c))

  if (ranked[0]?.score && ranked[0].score >= 0.9) return ranked[0].c
  return null
}

export const ingestStatcan46100092AskingRents = (input: {
  csvText: string
  /** CMHC city strings per province (active dataset), for mapping StatCan GEO labels to app keys. */
  cmhcCitiesByProvince: Record<string, string[]>
  /** When the source was fetched (ISO string) */
  fetchedAt: string
}): StatcanAskingRentQuarterly[] => {
  const { headers, rows } = parseStatCanCsv(input.csvText)
  if (headers.length === 0) return []

  const iRef = colIndex(headers, 'REF_DATE')
  const iGeo = colIndex(headers, 'GEO')
  const iChar = colIndex(headers, 'Characteristics')
  const iVal = colIndex(headers, 'VALUE')
  const iStatus = colIndex(headers, 'STATUS')

  if (iRef < 0 || iGeo < 0 || iChar < 0 || iVal < 0) {
    throw new Error(`StatCan CSV missing required columns. Found headers: ${headers.join(', ')}`)
  }

  const out: StatcanAskingRentQuarterly[] = []
  for (const r of rows) {
    const refDate = r[iRef] ?? ''
    const geo = r[iGeo] ?? ''
    const characteristics = r[iChar] ?? ''
    const rawValue = r[iVal] ?? ''
    const status = iStatus >= 0 ? (r[iStatus] ?? '') : ''

    const askingRent = parseNumber(rawValue)
    if (!askingRent || askingRent <= 0) continue

    const bedrooms = parseBedrooms(characteristics)
    if (bedrooms === null) continue

    const province = guessProvinceCodeFromGeo(geo)
    if (!province) continue

    const candidates = input.cmhcCitiesByProvince[province] ?? []
    const cma = resolveCmhcCityForGeo(geo, candidates) ?? stripGeoToCity(geo)

    const quality: StatcanAskingRentQuarterly['quality'] =
      status.trim().toUpperCase() === 'E' ? 'estimated' : 'verified'

    out.push({
      id: `${refDate}|${province}|${cma}|${bedrooms}`,
      refDate,
      province,
      cma,
      bedrooms,
      askingRent: Math.round(askingRent),
      source: 'STATCAN_46100092',
      sourceDate: input.fetchedAt.slice(0, 10),
      quality,
      ...(status ? { status } : {}),
    })
  }

  return out
}

