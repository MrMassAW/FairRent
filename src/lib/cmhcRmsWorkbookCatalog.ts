import type { CmhcIngestProfile } from './cmhcRmsParse'

export interface CmhcRmsWorkbookCatalogEntry {
  id: string
  label: string
  url: string
  defaultSheet: string
  ingestProfile: CmhcIngestProfile
  /** Required for regional Table 3.1.2. */
  provinceCode?: string
}

const sheetOverrideKey = (catalogId: string) => `fairrent.cmhc.sheet.${catalogId}`

export const getStoredSheetOverride = (catalogId: string): string | null => {
  try {
    const v = localStorage.getItem(sheetOverrideKey(catalogId))
    return v && v.trim() ? v.trim() : null
  } catch {
    return null
  }
}

export const setStoredSheetOverride = (catalogId: string, sheetName: string | null) => {
  try {
    if (!sheetName) localStorage.removeItem(sheetOverrideKey(catalogId))
    else localStorage.setItem(sheetOverrideKey(catalogId), sheetName)
  } catch {
    /* ignore */
  }
}

export const loadCmhcRmsWorkbookCatalog = async (surveyYear: number): Promise<CmhcRmsWorkbookCatalogEntry[]> => {
  const path = `/data/cmhc-rms-workbooks-${surveyYear}.json`
  const res = await fetch(path)
  if (!res.ok) {
    throw new Error(`No workbook catalog for ${surveyYear} (${res.status}). Add public/data/cmhc-rms-workbooks-${surveyYear}.json`)
  }
  const data = (await res.json()) as CmhcRmsWorkbookCatalogEntry[]
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`Workbook catalog empty for ${surveyYear}.`)
  }
  return data
}

/** Use Vite dev proxy to avoid CORS on CMHC assets. */
export const resolveCmhcFetchUrl = (absoluteUrl: string): string => {
  if (typeof window === 'undefined') return absoluteUrl
  const prefix = 'https://assets.cmhc-schl.gc.ca/'
  if (import.meta.env.DEV && absoluteUrl.startsWith(prefix)) {
    return `/cmhc-assets/${absoluteUrl.slice(prefix.length)}`
  }
  return absoluteUrl
}
