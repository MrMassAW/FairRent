import { resolveCmhcCityToStatcanGeo } from './cmhcCityToStatcanGeo'
import { colIndex, parseStatCanCsv } from './statcanCsv'
import { fetchWdsZipCsvText } from './statcanWds'

/** Table 18-10-0001-01 (WDS id 18100001) */
const TABLE_OIL = '18100001'
/** Table 25-10-0059-01 (WDS id 25100059) */
const TABLE_GAS = '25100059'
/** Table 18-10-0204-01 (WDS id 18100204) */
const TABLE_EPSPI = '18100204'

const OIL_FUEL = 'Household heating fuel'
const OIL_UOM = 'Cents per litre'

const GAS_DISTRIBUTION = 'Deliveries to residential consumers'
const GAS_STAT_VOLUME = 'Cubic metres'
const GAS_STAT_DOLLARS = 'Canadian dollars'

const EPSPI_INDEX = 'Electric power selling price under 5000kw'
const CANADA_GEO = 'Canada'

/** CMHC two-letter code → Statistics Canada `GEO` for provincial series (gas / EPSPI). */
export const PROVINCE_CODE_TO_STATCAN_GEO: Record<string, string> = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon',
}

export type StatcanUtilitySnapshot = {
  months: Set<string>
  /** month → province code → electricity ratio vs Canada (EPSPI under 5000 kW). */
  electricityRatioByMonthProvince: Map<string, Map<string, number>>
  /** month → province code → natural gas implied $/m³ ratio vs Canada (residential deliveries). */
  naturalGasRatioByMonthProvince: Map<string, Map<string, number>>
  /** month → StatCan GEO → household heating oil cents/L (Table 18-10-0001-01). */
  oilCentsPerLitreByMonthGeo: Map<string, Map<string, number>>
}

const parseNum = (raw: string | undefined): number | null => {
  if (raw === undefined || raw === null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

const ingestOil = (
  csvText: string,
  monthSet: Set<string>,
): Map<string, Map<string, number>> => {
  const { headers, rows } = parseStatCanCsv(csvText)
  const iRef = colIndex(headers, 'REF_DATE')
  const iGeo = colIndex(headers, 'GEO')
  const iFuel = colIndex(headers, 'Type of fuel')
  const iUom = colIndex(headers, 'UOM')
  const iVal = colIndex(headers, 'VALUE')
  const out = new Map<string, Map<string, number>>()
  for (const row of rows) {
    const month = row[iRef]
    if (!monthSet.has(month)) continue
    if (row[iFuel] !== OIL_FUEL) continue
    if (row[iUom] !== OIL_UOM) continue
    const v = parseNum(row[iVal])
    if (v === null) continue
    const geo = row[iGeo]
    if (!out.has(month)) out.set(month, new Map())
    out.get(month)!.set(geo, v)
  }
  return out
}

const ingestGas = (
  csvText: string,
  monthSet: Set<string>,
): Map<string, Map<string, number>> => {
  const { headers, rows } = parseStatCanCsv(csvText)
  const iRef = colIndex(headers, 'REF_DATE')
  const iGeo = colIndex(headers, 'GEO')
  const iDist = colIndex(headers, 'Distribution')
  const iStat = colIndex(headers, 'Statistics')
  const iVal = colIndex(headers, 'VALUE')
  /** month → geo → statistic → value */
  const cube = new Map<string, Map<string, Map<string, number>>>()
  for (const row of rows) {
    const month = row[iRef]
    if (!monthSet.has(month)) continue
    if (row[iDist] !== GAS_DISTRIBUTION) continue
    const stat = row[iStat]
    if (stat !== GAS_STAT_VOLUME && stat !== GAS_STAT_DOLLARS) continue
    const v = parseNum(row[iVal])
    if (v === null) continue
    const geo = row[iGeo]
    if (!cube.has(month)) cube.set(month, new Map())
    const mg = cube.get(month)!
    if (!mg.has(geo)) mg.set(geo, new Map())
    mg.get(geo)!.set(stat, v)
  }
  const ratios = new Map<string, Map<string, number>>()
  for (const [month, geos] of cube) {
    const canada = geos.get(CANADA_GEO)
    if (!canada) continue
    const m3Ca = canada.get(GAS_STAT_VOLUME)
    const dollarsCa = canada.get(GAS_STAT_DOLLARS)
    if (m3Ca === undefined || dollarsCa === undefined || m3Ca === 0) continue
    const canadaImplied = dollarsCa / m3Ca
    const provMap = new Map<string, number>()
    for (const [code, geoName] of Object.entries(PROVINCE_CODE_TO_STATCAN_GEO)) {
      const g = geos.get(geoName)
      if (!g) continue
      const m3 = g.get(GAS_STAT_VOLUME)
      const dollars = g.get(GAS_STAT_DOLLARS)
      if (m3 === undefined || dollars === undefined || m3 === 0) continue
      const implied = dollars / m3
      provMap.set(code, implied / canadaImplied)
    }
    ratios.set(month, provMap)
  }
  return ratios
}

const ingestElec = (
  csvText: string,
  monthSet: Set<string>,
): Map<string, Map<string, number>> => {
  const { headers, rows } = parseStatCanCsv(csvText)
  const iRef = colIndex(headers, 'REF_DATE')
  const iGeo = colIndex(headers, 'GEO')
  const iIndex = colIndex(headers, 'Index')
  const iVal = colIndex(headers, 'VALUE')
  /** month → geo → value */
  const byMonth = new Map<string, Map<string, number>>()
  for (const row of rows) {
    const month = row[iRef]
    if (!monthSet.has(month)) continue
    if (row[iIndex] !== EPSPI_INDEX) continue
    const v = parseNum(row[iVal])
    if (v === null) continue
    const geo = row[iGeo]
    if (!byMonth.has(month)) byMonth.set(month, new Map())
    byMonth.get(month)!.set(geo, v)
  }
  const ratios = new Map<string, Map<string, number>>()
  for (const [month, geos] of byMonth) {
    const canada = geos.get(CANADA_GEO)
    if (canada === undefined || canada === 0) continue
    const provMap = new Map<string, number>()
    for (const [code, geoName] of Object.entries(PROVINCE_CODE_TO_STATCAN_GEO)) {
      const val = geos.get(geoName)
      if (val === undefined) continue
      provMap.set(code, val / canada)
    }
    ratios.set(month, provMap)
  }
  return ratios
}

/**
 * Download and parse StatCan tables for the given `YYYY-MM` months.
 * Returns ratios relative to Canada where possible (electricity, gas; oil uses raw CMA + Canada).
 */
export const fetchStatcanUtilitySnapshot = async (
  months: readonly string[],
): Promise<{ ok: true; snapshot: StatcanUtilitySnapshot } | { ok: false; error: string }> => {
  const monthSet = new Set(months)
  try {
    const [oilCsv, gasCsv, elecCsv] = await Promise.all([
      fetchWdsZipCsvText(TABLE_OIL),
      fetchWdsZipCsvText(TABLE_GAS),
      fetchWdsZipCsvText(TABLE_EPSPI),
    ])
    const oilCentsPerLitreByMonthGeo = ingestOil(oilCsv, monthSet)
    const naturalGasRatioByMonthProvince = ingestGas(gasCsv, monthSet)
    const electricityRatioByMonthProvince = ingestElec(elecCsv, monthSet)
    return {
      ok: true,
      snapshot: {
        months: monthSet,
        oilCentsPerLitreByMonthGeo,
        naturalGasRatioByMonthProvince,
        electricityRatioByMonthProvince,
      },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

/**
 * Oil price ratio vs Canada for a CMHC city, using StatCan CMA GEO when available.
 * Returns `null` if Canada or local price missing for the month.
 */
export const oilRatioForCmhcCity = (
  snapshot: StatcanUtilitySnapshot,
  month: string,
  provinceCode: string,
  cmhcCity: string,
): number | null => {
  const monthMap = snapshot.oilCentsPerLitreByMonthGeo.get(month)
  if (!monthMap) return null
  const canada = monthMap.get('Canada')
  if (canada === undefined || canada === 0) return null
  const candidates = [...monthMap.keys()]
  const geo = resolveCmhcCityToStatcanGeo(provinceCode, cmhcCity, candidates)
  if (!geo) return null
  const local = monthMap.get(geo)
  if (local === undefined) return null
  return local / canada
}

export const provinceRatioElectricity = (
  snapshot: StatcanUtilitySnapshot,
  month: string,
  provinceCode: string,
): number | null => {
  const m = snapshot.electricityRatioByMonthProvince.get(month)
  if (!m) return null
  const r = m.get(provinceCode.trim().toUpperCase())
  return r === undefined ? null : r
}

export const provinceRatioNaturalGas = (
  snapshot: StatcanUtilitySnapshot,
  month: string,
  provinceCode: string,
): number | null => {
  const m = snapshot.naturalGasRatioByMonthProvince.get(month)
  if (!m) return null
  const r = m.get(provinceCode.trim().toUpperCase())
  return r === undefined ? null : r
}
