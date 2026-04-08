import type { CmhcRentRow } from '../data/cmhcRents'
import {
  extractCmhcRmsWithProgress,
  type CmhcRmsExtractEvent,
} from './cmhcRmsBrowserIngest'
import { mergeCmhcRentRows } from './cmhcRmsParse'
import type { CmhcRmsWorkbookCatalogEntry } from './cmhcRmsWorkbookCatalog'
import {
  getStoredSheetOverride,
  resolveCmhcFetchUrl,
  setStoredSheetOverride,
} from './cmhcRmsWorkbookCatalog'

export type CmhcPipelineLogLevel = 'info' | 'warn' | 'error'

export type CmhcPipelineEvent =
  | { kind: 'file_start'; entry: CmhcRmsWorkbookCatalogEntry; index: number; total: number }
  | { kind: 'file_phase'; entryId: string; label: string; state: 'start' | 'end'; ok?: boolean; detail?: string }
  | {
      kind: 'awaiting_sheet_choice'
      entry: CmhcRmsWorkbookCatalogEntry
      sheetNames: string[]
      expectedSheet: string
      buffer: ArrayBuffer
      accumulatedRows: CmhcRentRow[]
    }
  | { kind: 'extract_event'; entryId: string; event: CmhcRmsExtractEvent }
  | { kind: 'file_complete'; entryId: string; rowCount: number }
  | { kind: 'file_error'; entry: CmhcRmsWorkbookCatalogEntry; message: string }
  | { kind: 'merge_complete'; totalRows: number; conflicts: number }
  | { kind: 'master_updated'; rows: CmhcRentRow[] }
  | { kind: 'log'; level: CmhcPipelineLogLevel; message: string }
  | { kind: 'aborted' }

export type RunCmhcPipelineOptions = {
  surveyYear: number
  catalog: CmhcRmsWorkbookCatalogEntry[]
  /** Start index in catalog (inclusive). */
  startIndex?: number
  /** End index (exclusive). If omitted, runs through end. */
  endIndex?: number
  /** Seed merge state (e.g. resume after sheet pick). */
  initialRows?: CmhcRentRow[]
  signal?: AbortSignal
  onEvent: (e: CmhcPipelineEvent) => void
  /** When true, resume after NEEDS_SHEET_CHOICE by calling resumeWithSheet from UI. */
  pauseOnMissingSheet?: boolean
  /** Use these buffers instead of downloading for matching catalog entry ids (e.g. user-picked .xlsx). */
  localBuffersByEntryId?: Readonly<Record<string, ArrayBuffer>>
}

export type PipelineResumeContext = {
  entry: CmhcRmsWorkbookCatalogEntry
  buffer: ArrayBuffer
  surveyYear: number
  sheetName: string
  index: number
  total: number
}

const phase = (
  onEvent: (e: CmhcPipelineEvent) => void,
  entryId: string,
  label: string,
  fn: () => Promise<void>,
) =>
  (async () => {
    onEvent({ kind: 'file_phase', entryId, label, state: 'start' })
    try {
      await fn()
      onEvent({ kind: 'file_phase', entryId, label, state: 'end', ok: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      onEvent({ kind: 'file_phase', entryId, label, state: 'end', ok: false, detail: msg })
      throw e
    }
  })()

export const runCmhcPipeline = async (
  options: RunCmhcPipelineOptions,
): Promise<{ rows: CmhcRentRow[]; aborted: boolean; pendingSheetChoice: PipelineResumeContext | null }> => {
  const {
    surveyYear,
    catalog,
    startIndex = 0,
    endIndex = catalog.length,
    initialRows = [],
    signal,
    onEvent,
    pauseOnMissingSheet = true,
    localBuffersByEntryId,
  } = options

  let master: CmhcRentRow[] = [...initialRows]
  let conflicts = 0
  let aborted = false
  let pendingSheetChoice: PipelineResumeContext | null = null

  const slice = catalog.slice(startIndex, endIndex)

  for (let i = 0; i < slice.length; i += 1) {
    if (signal?.aborted) {
      aborted = true
      onEvent({ kind: 'aborted' })
      break
    }

    const entry = slice[i]
    const globalIndex = startIndex + i
    onEvent({ kind: 'file_start', entry, index: globalIndex, total: catalog.length })

    try {
      let buffer: ArrayBuffer | undefined
      const localBuf = localBuffersByEntryId?.[entry.id]
      const downloadLabel = localBuf ? 'Download (local file)' : 'Download (URL)'
      await phase(onEvent, entry.id, downloadLabel, async () => {
        if (localBuf) {
          buffer = localBuf.slice(0)
          return
        }
        const url = resolveCmhcFetchUrl(entry.url)
        const res = await fetch(url, { signal })
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${entry.url}`)
        buffer = await res.arrayBuffer()
      })
      if (!buffer) throw new Error('Download produced empty buffer.')
      const fileBuffer = buffer

      const storedSheet = getStoredSheetOverride(entry.id)
      const sheetName = storedSheet ?? entry.defaultSheet

      const tryExtract = async (name: string) =>
        extractCmhcRmsWithProgress(fileBuffer, {
          sheetName: name,
          ingestProfile: entry.ingestProfile,
          surveyYear,
          provinceCode: entry.provinceCode,
          batchSize: 20,
          fileLabel: entry.label,
          onEvent: (ev) => onEvent({ kind: 'extract_event', entryId: entry.id, event: ev }),
        })

      let rows: CmhcRentRow[]
      try {
        rows = await tryExtract(sheetName)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (pauseOnMissingSheet && msg.startsWith('NEEDS_SHEET_CHOICE:')) {
          const wbModule = await import('xlsx')
          const wb = wbModule.read(fileBuffer, { type: 'array' })
          pendingSheetChoice = {
            entry,
            buffer: fileBuffer,
            surveyYear,
            sheetName: entry.defaultSheet,
            index: globalIndex,
            total: catalog.length,
          }
          onEvent({
            kind: 'awaiting_sheet_choice',
            entry,
            sheetNames: [...wb.SheetNames],
            expectedSheet: entry.defaultSheet,
            buffer: fileBuffer,
            accumulatedRows: master,
          })
          return { rows: master, aborted: false, pendingSheetChoice }
        }
        throw e
      }

      const prevLen = master.length
      master = mergeCmhcRentRows(master, rows, () => {
        conflicts += 1
      })
      onEvent({ kind: 'master_updated', rows: master })
      onEvent({
        kind: 'log',
        level: 'info',
        message: `Merged ${entry.label}: +${rows.length} rows (master ${prevLen} → ${master.length}, conflicts ${conflicts})`,
      })
      onEvent({ kind: 'file_complete', entryId: entry.id, rowCount: rows.length })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      onEvent({ kind: 'file_error', entry, message })
      onEvent({ kind: 'log', level: 'error', message: `${entry.label}: ${message}` })
    }
  }

  onEvent({ kind: 'merge_complete', totalRows: master.length, conflicts })
  return { rows: master, aborted, pendingSheetChoice: null }
}

export const resumePipelineAfterSheetChoice = async (
  ctx: PipelineResumeContext,
  chosenSheet: string,
  options: Pick<RunCmhcPipelineOptions, 'onEvent' | 'signal' | 'pauseOnMissingSheet' | 'localBuffersByEntryId'> & {
    catalog: CmhcRmsWorkbookCatalogEntry[]
    master: CmhcRentRow[]
    rememberSheet: boolean
  },
): Promise<{ rows: CmhcRentRow[]; pendingSheetChoice: PipelineResumeContext | null }> => {
  const {
    onEvent,
    signal,
    catalog,
    master: initialMaster,
    rememberSheet,
    pauseOnMissingSheet = true,
    localBuffersByEntryId,
  } = options
  const { entry, buffer, surveyYear } = ctx

  if (rememberSheet) {
    setStoredSheetOverride(entry.id, chosenSheet)
  }

  let master = initialMaster
  let conflicts = 0

  try {
    const rows = await extractCmhcRmsWithProgress(buffer, {
      sheetName: chosenSheet,
      ingestProfile: entry.ingestProfile,
      surveyYear,
      provinceCode: entry.provinceCode,
      batchSize: 20,
      fileLabel: entry.label,
      onEvent: (ev) => onEvent({ kind: 'extract_event', entryId: entry.id, event: ev }),
    })

    master = mergeCmhcRentRows(master, rows, () => {
      conflicts += 1
    })
    onEvent({ kind: 'master_updated', rows: master })
    onEvent({ kind: 'file_complete', entryId: entry.id, rowCount: rows.length })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (pauseOnMissingSheet && message.startsWith('NEEDS_SHEET_CHOICE:')) {
      const wbModule = await import('xlsx')
      const wb = wbModule.read(buffer, { type: 'array' })
      onEvent({
        kind: 'awaiting_sheet_choice',
        entry,
        sheetNames: [...wb.SheetNames],
        expectedSheet: chosenSheet,
        buffer,
        accumulatedRows: master,
      })
      return {
        rows: master,
        pendingSheetChoice: { ...ctx, sheetName: chosenSheet },
      }
    }
    onEvent({ kind: 'file_error', entry, message })
    throw e
  }

  const startAfter = catalog.findIndex((c) => c.id === entry.id) + 1
  if (startAfter < catalog.length) {
    const rest = await runCmhcPipeline({
      surveyYear,
      catalog,
      startIndex: startAfter,
      initialRows: master,
      signal,
      onEvent,
      pauseOnMissingSheet,
      localBuffersByEntryId,
    })
    return { rows: rest.rows, pendingSheetChoice: rest.pendingSheetChoice }
  }

  onEvent({ kind: 'merge_complete', totalRows: master.length, conflicts })
  return { rows: master, pendingSheetChoice: null }
}
