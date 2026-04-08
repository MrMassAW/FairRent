import JSZip from 'jszip'
import { resolveStatCanUrl } from './statcanFetch'

export const fetchWdsZipCsvText = async (tableId: string, lang: 'en' | 'fr' = 'en'): Promise<string> => {
  const clean = tableId.trim()
  if (!/^\d+$/.test(clean)) {
    throw new Error(`StatCan WDS: invalid table id "${tableId}"`)
  }
  const wdsUrl = resolveStatCanUrl(`/t1/wds/rest/getFullTableDownloadCSV/${clean}/${lang}`)
  const wdsRes = await fetch(wdsUrl)
  if (!wdsRes.ok) {
    throw new Error(`StatCan WDS ${clean}: HTTP ${wdsRes.status}`)
  }
  const wdsJson = (await wdsRes.json()) as { status?: string; object?: string }
  if (wdsJson.status !== 'SUCCESS' || !wdsJson.object) {
    throw new Error(`StatCan WDS ${clean}: ${JSON.stringify(wdsJson)}`)
  }

  const zipUrl = resolveStatCanUrl(wdsJson.object)
  const zipRes = await fetch(zipUrl)
  if (!zipRes.ok) {
    throw new Error(`StatCan zip ${clean}: HTTP ${zipRes.status}`)
  }
  const buf = await zipRes.arrayBuffer()
  const z = await JSZip.loadAsync(buf)
  const expectedName = `${clean}.csv`
  const csvFile =
    z.file(expectedName) ??
    // Fallback: StatCan occasionally changes casing or adds extra suffixes.
    z.file(new RegExp(`^${clean}.*\\.csv$`, 'i'))?.[0] ??
    // Fallback: pick the first csv in the archive (still better than failing hard).
    Object.values(z.files).find((f) => !f.dir && f.name.toLowerCase().endsWith('.csv'))
  if (!csvFile) {
    const names = Object.keys(z.files)
      .slice(0, 12)
      .join(', ')
    throw new Error(`StatCan zip ${clean}: missing CSV file (expected ${expectedName}). Found: ${names}${Object.keys(z.files).length > 12 ? ', …' : ''}`)
  }
  return csvFile.async('string')
}

