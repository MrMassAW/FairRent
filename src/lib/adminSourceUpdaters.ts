import type { SourceReference } from '../types/adminData'
import { extractCmhcRmsRentsFromXlsxArrayBuffer } from './cmhcRmsBrowserIngest'
import {
  bulkDeleteStatcanAskingRentsQuarterly,
  bulkUpsertStatcanAskingRentQuarterly,
  readAllStatcanAskingRentsQuarterly,
  getActiveDataset,
  saveDataset,
  runCategoryMonthlyFetch,
} from './adminDataStore'
import { fetchWdsZipCsvText } from './statcanWds'
import { ingestStatcan46100092AskingRents } from './statcanRentIngest'

export type SourceUpdateStepEvent =
  | { kind: 'step'; sourceId: string; id: string; label: string; state: 'start' }
  | { kind: 'step'; sourceId: string; id: string; state: 'end'; ok: boolean; detail?: string }

export type SourceUpdateResult = { ok: true; logLines: string[] } | { ok: false; logLines: string[]; error: string }

type UpdateContext = {
  source: SourceReference
  onStep?: (e: SourceUpdateStepEvent) => void
  onLog?: (line: string) => void
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const MIN_STEP_MS = 450

const runStep = async <T>(
  ctx: UpdateContext,
  stepId: string,
  label: string,
  fn: () => Promise<T>,
): Promise<T> => {
  const startedAt = Date.now()
  ctx.onStep?.({ kind: 'step', sourceId: ctx.source.id, id: stepId, label, state: 'start' })
  try {
    const result = await fn()
    const dt = Date.now() - startedAt
    if (dt < MIN_STEP_MS) await sleep(MIN_STEP_MS - dt)
    ctx.onStep?.({ kind: 'step', sourceId: ctx.source.id, id: stepId, state: 'end', ok: true })
    return result
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const dt = Date.now() - startedAt
    if (dt < MIN_STEP_MS) await sleep(MIN_STEP_MS - dt)
    ctx.onStep?.({ kind: 'step', sourceId: ctx.source.id, id: stepId, state: 'end', ok: false, detail: msg })
    throw e
  }
}

const tsLine = (msg: string) => `[${new Date().toISOString().slice(11, 19)}] ${msg}`

const parseQuarterKey = (refDate: string): { year: number; quarter: number } | null => {
  const m = refDate.trim().match(/^(\d{4})\s*Q([1-4])$/i)
  if (!m) return null
  return { year: Number(m[1]), quarter: Number(m[2]) }
}

const maxQuarter = (a: string, b: string): string => {
  const ka = parseQuarterKey(a)
  const kb = parseQuarterKey(b)
  if (!ka && !kb) return a >= b ? a : b
  if (!ka) return b
  if (!kb) return a
  const ai = ka.year * 4 + (ka.quarter - 1)
  const bi = kb.year * 4 + (kb.quarter - 1)
  return ai >= bi ? a : b
}

export const canUpdateSource = (id: string): boolean => {
  return id === 'cmhc-rms-excel' || id === 'statcan-rents'
}

export const runSourceUpdate = async (
  source: SourceReference,
  options?: { onStep?: (e: SourceUpdateStepEvent) => void; onLog?: (line: string) => void },
): Promise<SourceUpdateResult> => {
  const logLines: string[] = []
  const log = (m: string) => {
    const line = tsLine(m)
    logLines.push(line)
    options?.onLog?.(line)
  }
  const ctx: UpdateContext = { source, onStep: options?.onStep, onLog: options?.onLog }

  try {
    if (source.id !== 'cmhc-rms-excel' && source.id !== 'statcan-rents') {
      throw new Error(`No updater implemented for source "${source.id}" yet.`)
    }

    log(`Source update started — ${source.name} (${source.id})`)

    if (source.id === 'statcan-rents') {
      const existingIds = await runStep(ctx, 'preload', 'Reading existing StatCan series', async () => {
        try {
          const all = await readAllStatcanAskingRentsQuarterly()
          log(`Existing StatCan quarterly rows in IndexedDB: ${all.length}`)
          return all.map((r) => r.id)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          log(`Existing StatCan rows unavailable (continuing): ${msg}`)
          return [] as string[]
        }
      })

      const csvText = await runStep(ctx, 'fetch', 'Fetching (StatCan WDS CSV)', async () => {
        // Table 46-10-0092-01 → WDS full-table id 46100092
        log('Fetching StatCan WDS full-table CSV for 46-10-0092-01 (46100092)')
        return fetchWdsZipCsvText('46100092', 'en')
      })

      const parsed = await runStep(ctx, 'parse', 'Parsing & normalizing', async () => {
        const active = await getActiveDataset()
        if (!active) throw new Error('No active dataset found (CMHC seed missing).')
        const citiesByProvince: Record<string, string[]> = {}
        for (const r of active.rents) {
          const p = r.province.trim().toUpperCase()
          if (!citiesByProvince[p]) citiesByProvince[p] = []
          if (!citiesByProvince[p].includes(r.city)) citiesByProvince[p].push(r.city)
        }
        const fetchedAt = new Date().toISOString()
        const rows = ingestStatcan46100092AskingRents({ csvText, cmhcCitiesByProvince: citiesByProvince, fetchedAt })
        const latestRefDate = rows.reduce((acc, r) => (acc ? maxQuarter(acc, r.refDate) : r.refDate), '')
        log(`Parsed ${rows.length} StatCan quarterly asking-rent rows.${latestRefDate ? ` Latest REF_DATE=${latestRefDate}.` : ''}`)
        return rows
      })

      await runStep(ctx, 'inject', 'Injecting (persist StatCan rent series)', async () => {
        await bulkUpsertStatcanAskingRentQuarterly(parsed)
        const keep = new Set(parsed.map((r) => r.id))
        const toDelete = existingIds.filter((id) => !keep.has(id))
        if (toDelete.length > 0) {
          await bulkDeleteStatcanAskingRentsQuarterly(toDelete)
          log(`Pruned ${toDelete.length} obsolete StatCan rows (ids not present in latest pull).`)
        } else {
          log('No obsolete StatCan rows to prune.')
        }
      })

      await runStep(ctx, 'rebuild', 'Rebuilding monthly rents', async () => {
        const r = await runCategoryMonthlyFetch('monthly-rents')
        if (!r.ok) throw new Error(r.error ?? 'Monthly rebuild failed')
      })

      log('Source update finished successfully.')
      return { ok: true, logLines }
    }

    const resolved = await runStep(ctx, 'discover', 'Discovering latest download link', async () => {
      return {
        url: source.url,
        surveyYear: (() => {
          const m = source.url.match(/\/(20\d{2})\/rmr-canada-\1-en\.xlsx/i)
          return m?.[1] ? Number(m[1]) : new Date().getUTCFullYear()
        })(),
      }
    })

    const res = await runStep(ctx, 'fetch', 'Fetching (download)', async () => {
      log(`Fetching ${resolved.url}`)
      const r = await fetch(resolved.url, { redirect: 'follow' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.arrayBuffer()
    })

    const extracted = await runStep(ctx, 'extract', 'Extracting', async () => {
      return extractCmhcRmsRentsFromXlsxArrayBuffer(res, resolved.surveyYear)
    })

    await runStep(ctx, 'parse', 'Parsing & validating', async () => {
      log(`Parsed ${extracted.length} CMHC rent rows.`)
    })

    const active = await runStep(ctx, 'inject', 'Injecting (update active dataset)', async () => {
      const ds = await getActiveDataset()
      if (!ds) throw new Error('No active dataset found.')
      const updated = { ...ds, rents: extracted }
      await saveDataset(updated)
      return updated
    })

    await runStep(ctx, 'rebuild', 'Rebuilding monthly rents', async () => {
      const r = await runCategoryMonthlyFetch('monthly-rents')
      if (!r.ok) throw new Error(r.error ?? 'Monthly rebuild failed')
      log(`Monthly rent rows rebuilt. Active dataset: ${active.id}`)
    })

    log('Source update finished successfully.')
    return { ok: true, logLines }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log(`FAIL — ${msg}`)
    return { ok: false, logLines, error: msg }
  }
}

