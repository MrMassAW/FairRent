import { parseStatCanCsv } from '../statcanCsv'

export type CkanPackageShowResource = {
  format?: string
  name?: string
  url?: string
}

export type CkanPackageShowResult = {
  success: boolean
  result?: {
    title?: string
    resources?: CkanPackageShowResource[]
  }
}

export const fetchCkanPackageShow = async (
  packageId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CkanPackageShowResult> => {
  const url = `https://open.canada.ca/data/en/api/3/action/package_show?id=${encodeURIComponent(packageId)}`
  const res = await fetchImpl(url)
  if (!res.ok) {
    throw new Error(`CKAN package_show(${packageId}): HTTP ${res.status}`)
  }
  return (await res.json()) as CkanPackageShowResult
}

export const pickCsvResourceUrl = (resources: CkanPackageShowResource[] | undefined): string | null => {
  if (!resources?.length) return null
  const csv = resources.find((r) => (r.format ?? '').toUpperCase() === 'CSV' && r.url)
  return csv?.url ?? null
}

/** Parse Alberta Energy Prices CSV (When,Type,Unit,Alberta). */
export const parseAlbertaEnergyPricesCsv = (
  csvText: string,
): { type: string; when: string; value: number; unit: string }[] => {
  const { headers, rows } = parseStatCanCsv(csvText)
  const iWhen = headers.findIndex((h) => h === 'When')
  const iType = headers.findIndex((h) => h === 'Type')
  const iUnit = headers.findIndex((h) => h === 'Unit')
  const iVal = headers.findIndex((h) => h === 'Alberta')
  if (iWhen < 0 || iType < 0 || iUnit < 0 || iVal < 0) {
    return []
  }
  const out: { type: string; when: string; value: number; unit: string }[] = []
  for (const row of rows) {
    const v = Number(row[iVal])
    if (!Number.isFinite(v)) continue
    out.push({
      when: row[iWhen],
      type: row[iType],
      unit: row[iUnit],
      value: v,
    })
  }
  return out
}

export const latestNatGasAlbertaGj = (
  rows: ReturnType<typeof parseAlbertaEnergyPricesCsv>,
): { effective_date: string; unit_cost_cad: number } | null => {
  const gas = rows.filter((r) => r.type === 'NatGas')
  if (gas.length === 0) return null
  gas.sort((a, b) => b.when.localeCompare(a.when))
  const last = gas[0]
  const [mm, dd, yyyy] = last.when.split('/')
  if (!mm || !dd || !yyyy) return null
  const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  return { effective_date: iso, unit_cost_cad: last.value }
}
