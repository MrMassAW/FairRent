/** CMHC Rental Market Report Data Tables — parse Edition / Geography from page HTML. */

export const CMHC_RMS_DATA_TABLES_PATH =
  '/professionals/housing-markets-data-and-research/housing-data/data-tables/rental-market/rental-market-report-data-tables'

const CMHC_WWW_ORIGIN = 'https://www.cmhc-schl.gc.ca'

export const cmhcRmsPageUrl = () => `${CMHC_WWW_ORIGIN}${CMHC_RMS_DATA_TABLES_PATH}`

const listingAgentBase = (): string | null => {
  const u = import.meta.env.VITE_LISTING_AGENT_URL?.trim()
  return u && u.length > 0 ? u.replace(/\/$/, '') : null
}

export const decodeHtmlEntities = (raw: string): string => {
  if (!raw.includes('&')) return raw.trim()
  const el =
    typeof document !== 'undefined'
      ? document.createElement('textarea')
      : (null as HTMLTextAreaElement | null)
  if (el) {
    el.innerHTML = raw
    return el.value.trim()
  }
  return raw
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

const extractSelectBlock = (html: string, selectId: string): string | null => {
  const id = selectId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`<select[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)</select>`, 'i')
  const m = html.match(re)
  return m ? m[0] : null
}

const parseOptionLabels = (selectHtml: string): string[] => {
  const labels: string[] = []
  const optRe = /<option[^>]*>([\s\S]*?)<\/option>/gi
  let m: RegExpExecArray | null
  while ((m = optRe.exec(selectHtml)) !== null) {
    const text = decodeHtmlEntities(m[1].replace(/\s+/g, ' ').trim())
    if (text.length > 0) labels.push(text)
  }
  return labels
}

export const parseCmhcRmsPageOptions = (html: string): { editions: number[]; geographies: string[] } => {
  const editionBlock = extractSelectBlock(html, 'pdf_edition')
  const geoBlock = extractSelectBlock(html, 'pdf_geo')
  const editionLabels = editionBlock ? parseOptionLabels(editionBlock) : []
  const editions = editionLabels
    .filter((s) => /^\d{4}$/.test(s))
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n >= 1990 && n <= 2100)
  const geographies = geoBlock ? parseOptionLabels(geoBlock) : []
  return { editions, geographies }
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { credentials: 'omit' })
  if (!res.ok) throw new Error(`HTTP ${res.status} loading CMHC page`)
  return res.text()
}

/**
 * Load raw HTML (dev: same-origin /cmhc-www proxy; prod: listing-agent /cmhc/rms-page-html).
 */
export const fetchCmhcRmsDataTablesHtml = async (): Promise<string> => {
  const agent = listingAgentBase()
  if (agent) {
    const res = await fetch(`${agent}/cmhc/rms-page-html`, { credentials: 'omit' })
    if (!res.ok) throw new Error(`Listing agent HTTP ${res.status} (CMHC page)`)
    const j = (await res.json()) as { html?: string }
    if (typeof j.html !== 'string' || !j.html.length) throw new Error('Invalid CMHC page response from server')
    return j.html
  }
  const path = `${CMHC_RMS_DATA_TABLES_PATH}`
  return fetchHtml(`/cmhc-www${path}`)
}

export const loadCmhcRmsPageOptions = async (): Promise<{ editions: number[]; geographies: string[] }> => {
  const html = await fetchCmhcRmsDataTablesHtml()
  return parseCmhcRmsPageOptions(html)
}

export const fallbackEditionYears = (): number[] => [2025, 2024, 2023, 2022, 2021, 2020, 2019]
