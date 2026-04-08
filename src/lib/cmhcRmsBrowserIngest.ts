import * as XLSX from 'xlsx'
import type { CmhcRentRow } from '../data/cmhcRents'
import type { CmhcIngestProfile } from './cmhcRmsParse'
import { ingestFromSheetRows } from './cmhcRmsParse'

export type CmhcRmsExtractEvent =
  | { kind: 'workbook_opened'; sheetNames: string[] }
  | { kind: 'sheets_listed'; sheetNames: string[] }
  | { kind: 'needs_sheet_choice'; sheetNames: string[]; expectedSheet: string }
  | { kind: 'sheet_selected'; sheetName: string }
  | { kind: 'row_batch'; rows: CmhcRentRow[]; fileLabel?: string }
  | { kind: 'complete'; rows: CmhcRentRow[] }
  | { kind: 'error'; message: string }

export type CmhcRmsExtractOptions = {
  sheetName: string
  ingestProfile: CmhcIngestProfile
  surveyYear: number
  provinceCode?: string
  /** Emit row_batch every N centre-rows processed (Table 6.0) or every N data rows (312). */
  batchSize?: number
  fileLabel?: string
  onEvent?: (e: CmhcRmsExtractEvent) => void
}

const emit = (onEvent: CmhcRmsExtractOptions['onEvent'], e: CmhcRmsExtractEvent) => {
  onEvent?.(e)
}

/**
 * Read workbook from ArrayBuffer; extract using ingest profile. Throws if sheet missing (caller handles UI pick).
 */
export const extractCmhcRmsFromXlsxArrayBuffer = (
  xlsx: ArrayBuffer,
  options: Omit<CmhcRmsExtractOptions, 'onEvent' | 'batchSize'>,
): CmhcRentRow[] => {
  const wb = XLSX.read(xlsx, { type: 'array' })
  const { sheetName, ingestProfile, surveyYear, provinceCode } = options
  if (!wb.SheetNames.includes(sheetName)) {
    throw new Error(`Missing sheet "${sheetName}". Found: ${wb.SheetNames.join(', ')}`)
  }
  const sheet = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]
  const out = ingestFromSheetRows(rows, surveyYear, ingestProfile, provinceCode)
  if (out.length === 0) {
    throw new Error(`Extracted 0 rows from "${sheetName}" (${ingestProfile}).`)
  }
  return out
}

export const openCmhcWorkbookSheets = (xlsx: ArrayBuffer): string[] => {
  const wb = XLSX.read(xlsx, { type: 'array' })
  return [...wb.SheetNames]
}

/**
 * Progressive extract: optional batched row events for UI.
 */
export const extractCmhcRmsWithProgress = async (
  xlsx: ArrayBuffer,
  options: CmhcRmsExtractOptions,
): Promise<CmhcRentRow[]> => {
  const { sheetName, ingestProfile, surveyYear, provinceCode, batchSize = 25, fileLabel, onEvent } = options
  const wb = XLSX.read(xlsx, { type: 'array' })
  emit(onEvent, { kind: 'workbook_opened', sheetNames: [...wb.SheetNames] })
  emit(onEvent, { kind: 'sheets_listed', sheetNames: [...wb.SheetNames] })

  if (!wb.SheetNames.includes(sheetName)) {
    emit(onEvent, {
      kind: 'needs_sheet_choice',
      sheetNames: [...wb.SheetNames],
      expectedSheet: sheetName,
    })
    throw new Error(`NEEDS_SHEET_CHOICE:${sheetName}`)
  }

  emit(onEvent, { kind: 'sheet_selected', sheetName })
  const sheet = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]

  const full = ingestFromSheetRows(rows, surveyYear, ingestProfile, provinceCode)
  if (full.length === 0) {
    const msg = `Extracted 0 rows from "${sheetName}" (${ingestProfile}).`
    emit(onEvent, { kind: 'error', message: msg })
    throw new Error(msg)
  }

  if (batchSize > 0) {
    for (let i = 0; i < full.length; i += batchSize) {
      emit(onEvent, { kind: 'row_batch', rows: full.slice(i, i + batchSize), fileLabel })
    }
  }

  emit(onEvent, { kind: 'complete', rows: full })
  return full
}

/** @deprecated Use extractCmhcRmsFromXlsxArrayBuffer with explicit profile, or pipeline. */
export const extractCmhcRmsRentsFromXlsxArrayBuffer = (xlsx: ArrayBuffer, surveyYear: number): CmhcRentRow[] =>
  extractCmhcRmsFromXlsxArrayBuffer(xlsx, {
    sheetName: 'Table 6.0',
    ingestProfile: 'rms-table-60-purpose-built',
    surveyYear,
  })
