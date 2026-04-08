import type { CmhcIngestProfile } from './cmhcRmsParse'
import type { CmhcRmsWorkbookCatalogEntry } from './cmhcRmsWorkbookCatalog'
import { CMHC_URBAN_CENTRES_BY_PROVINCE } from '../data/cmhcUrbanCentres'
import { decodeHtmlEntities } from './cmhcRmsPageOptions'

const ASSET_BASE =
  'https://assets.cmhc-schl.gc.ca/sites/cmhc/professional/housing-markets-data-and-research/housing-data-tables/rental-market/rental-market-report-data-tables'

const PROVINCE_LABELS: Record<string, string> = {
  'Newfoundland and Labrador': 'NL',
  'New Brunswick': 'NB',
  'Nova Scotia': 'NS',
  'Prince Edward Island': 'PE',
  Quebec: 'QC',
  Ontario: 'ON',
  Manitoba: 'MB',
  Saskatchewan: 'SK',
  Alberta: 'AB',
  'British Columbia': 'BC',
}

/** Slug segment in CMHC asset filename; full override when default algorithm fails. */
export const CMHC_GEOGRAPHY_SLUG_OVERRIDES: Record<string, string> = {
  'Greater Sudbury/Grand Sudbury': 'greater-sudbury',
  "St. John's": 'st-johns',
  'St. John&#39;s': 'st-johns',
  'Newfoundland and Labrador': 'newfoundland-labrador',
}

const normalizeGeoKey = (s: string): string =>
  decodeHtmlEntities(s)
    .trim()
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase()

/** Province code for CMA / centre rows (RMS major centres on CMHC page). */
const RMS_CENTRE_TO_PROVINCE: Record<string, string> = {
  'newfoundland and labrador': 'NL',
  'new brunswick': 'NB',
  'nova scotia': 'NS',
  'prince edward island': 'PE',
  quebec: 'QC',
  ontario: 'ON',
  manitoba: 'MB',
  saskatchewan: 'SK',
  alberta: 'AB',
  'british columbia': 'BC',
  'abbotsford - mission': 'BC',
  barrie: 'ON',
  'belleville - quinte west': 'ON',
  belleville: 'ON',
  brantford: 'ON',
  calgary: 'AB',
  charlottetown: 'PE',
  chilliwack: 'BC',
  drummondville: 'QC',
  edmonton: 'AB',
  fredericton: 'NB',
  gatineau: 'QC',
  'greater sudbury/grand sudbury': 'ON',
  guelph: 'ON',
  halifax: 'NS',
  hamilton: 'ON',
  kamloops: 'BC',
  kelowna: 'BC',
  kingston: 'ON',
  'kitchener - cambridge - waterloo': 'ON',
  lethbridge: 'AB',
  london: 'ON',
  moncton: 'NB',
  montreal: 'QC',
  nanaimo: 'BC',
  oshawa: 'ON',
  ottawa: 'ON',
  peterborough: 'ON',
  'québec cma': 'QC',
  'quebec cma': 'QC',
  'red deer': 'AB',
  regina: 'SK',
  saguenay: 'QC',
  'saint john': 'NB',
  saskatoon: 'SK',
  sherbrooke: 'QC',
  'st. catharines - niagara': 'ON',
  "st. john's": 'NL',
  'thunder bay': 'ON',
  'greater toronto area': 'ON',
  'trois rivieres': 'QC',
  vancouver: 'BC',
  victoria: 'BC',
  windsor: 'ON',
  winnipeg: 'MB',
  yellowknife: 'NT',
}

const findProvinceFromUrbanList = (labelNorm: string): string | null => {
  for (const [code, centres] of Object.entries(CMHC_URBAN_CENTRES_BY_PROVINCE)) {
    for (const c of centres) {
      if (normalizeGeoKey(c) === labelNorm) return code
    }
  }
  return null
}

export const labelToAssetSlug = (label: string): string => {
  const decoded = decodeHtmlEntities(label).trim()
  if (CMHC_GEOGRAPHY_SLUG_OVERRIDES[decoded]) return CMHC_GEOGRAPHY_SLUG_OVERRIDES[decoded]
  const key = normalizeGeoKey(decoded)
  for (const [k, slug] of Object.entries(CMHC_GEOGRAPHY_SLUG_OVERRIDES)) {
    if (normalizeGeoKey(k) === key) return slug
  }

  let s = decoded.normalize('NFD').replace(/\p{M}/gu, '')
  s = s.toLowerCase()
  s = s.replace(/'/g, '')
  s = s.replace(/\./g, '')
  s = s.replace(/[/\u2013\u2014]/g, '-')
  s = s.replace(/\s+/g, '-')
  s = s.replace(/[^a-z0-9-]+/g, '-')
  s = s.replace(/-+/g, '-').replace(/^-|-$/g, '')
  return s
}

export const buildRmrWorkbookUrl = (slug: string, year: number): string =>
  `${ASSET_BASE}/${year}/rmr-${slug}-${year}-en.xlsx`

export const resolveIngestForGeography = (
  geographyLabel: string,
): { ingestProfile: CmhcIngestProfile; defaultSheet: string; provinceCode?: string } => {
  const label = decodeHtmlEntities(geographyLabel).trim()
  if (label === 'Canada') {
    return { ingestProfile: 'rms-table-60-purpose-built', defaultSheet: 'Table 6.0' }
  }
  const prov = PROVINCE_LABELS[label]
  if (prov) {
    return {
      ingestProfile: 'rms-table-312-townhouse-apartment-combined',
      defaultSheet: 'Table 3.1.2',
      provinceCode: prov,
    }
  }
  const key = normalizeGeoKey(label)
  let provinceCode = RMS_CENTRE_TO_PROVINCE[key] ?? findProvinceFromUrbanList(key)
  if (!provinceCode) {
    provinceCode = 'ON'
  }
  return {
    ingestProfile: 'rms-table-312-townhouse-apartment-combined',
    defaultSheet: 'Table 3.1.2',
    provinceCode,
  }
}

export const geographyToCatalogEntry = (geographyLabel: string, surveyYear: number): CmhcRmsWorkbookCatalogEntry => {
  const slug = labelToAssetSlug(geographyLabel)
  const { ingestProfile, defaultSheet, provinceCode } = resolveIngestForGeography(geographyLabel)
  const id = `rmr-${slug}-${surveyYear}`
  return {
    id,
    label: decodeHtmlEntities(geographyLabel).trim(),
    url: buildRmrWorkbookUrl(slug, surveyYear),
    defaultSheet,
    ingestProfile,
    ...(provinceCode ? { provinceCode } : {}),
  }
}

export const buildCatalogFromGeographies = (
  geographies: string[],
  surveyYear: number,
): CmhcRmsWorkbookCatalogEntry[] => geographies.map((g) => geographyToCatalogEntry(g, surveyYear))
