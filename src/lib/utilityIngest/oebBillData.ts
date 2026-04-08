/**
 * Ontario Energy Board — residential electricity bill calculator XML.
 * @see https://www.oeb.ca/open-data/current-electricity-rates-residential-rate-class
 */

export type OebResidentialBillRow = {
  distributor: string
  netPerKwh: number
  serviceChargeMonthly: number
  year: number
}

const parseTag = (block: string, name: string): string => {
  const re = new RegExp(`<${name}>([^<]*)</${name}>`)
  const m = re.exec(block)
  return m ? m[1].trim() : ''
}

const parseNum = (raw: string): number | null => {
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** Parse OEB BillData.xml into residential rows (electricity). */
export const parseOebBillDataXml = (xml: string): OebResidentialBillRow[] => {
  const out: OebResidentialBillRow[] = []
  const re = /<BillDataRow>([\s\S]*?)<\/BillDataRow>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const block = m[1]
    const className = parseTag(block, 'Class')
    if (className !== 'RESIDENTIAL') continue
    const distributor = parseTag(block, 'Dist')
    const net = parseNum(parseTag(block, 'Net'))
    const sc = parseNum(parseTag(block, 'SC'))
    const year = parseNum(parseTag(block, 'YEAR'))
    if (net === null || sc === null || year === null) continue
    out.push({
      distributor,
      netPerKwh: net,
      serviceChargeMonthly: sc,
      year,
    })
  }
  return out
}

export const summarizeOebOntarioResidentialElectricity = (
  rows: OebResidentialBillRow[],
): { meanNetPerKwh: number; meanServiceCharge: number; count: number } | null => {
  if (rows.length === 0) return null
  const sumNet = rows.reduce((s, r) => s + r.netPerKwh, 0)
  const sumSc = rows.reduce((s, r) => s + r.serviceChargeMonthly, 0)
  return {
    meanNetPerKwh: sumNet / rows.length,
    meanServiceCharge: sumSc / rows.length,
    count: rows.length,
  }
}

export const OEB_BILL_DATA_XML_URL = 'https://www.oeb.ca/_html/calculator/data/BillData.xml'

const isBrowser = (): boolean => typeof window !== 'undefined'

/** In Vite dev, use `/oeb` proxy to avoid CORS; in production call the OEB host directly. */
export const resolveOebBillDataUrl = (): string => {
  if (isBrowser() && import.meta.env.DEV) {
    return '/oeb/_html/calculator/data/BillData.xml'
  }
  return OEB_BILL_DATA_XML_URL
}

export const fetchOebBillDataXml = async (fetchImpl: typeof fetch = fetch): Promise<string> => {
  const res = await fetchImpl(resolveOebBillDataUrl())
  if (!res.ok) {
    throw new Error(`OEB BillData.xml: HTTP ${res.status}`)
  }
  return res.text()
}
