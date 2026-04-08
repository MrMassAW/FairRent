import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import type { CmhcRentQualityGrade, CmhcRentRow } from '../../data/cmhcRents'
import { getActiveDataset, runCategoryMonthlyFetch, saveDataset } from '../../lib/adminDataStore'
import { CMHC_RENT_QUALITY_LABELS } from '../../lib/cmhcRentQuality'
import { buildCatalogFromGeographies, geographyToCatalogEntry } from '../../lib/cmhcRmsGeographyCatalog'
import type { CmhcPipelineEvent } from '../../lib/cmhcRmsPipeline'
import {
  resumePipelineAfterSheetChoice,
  runCmhcPipeline,
  type PipelineResumeContext,
} from '../../lib/cmhcRmsPipeline'
import { fallbackEditionYears, loadCmhcRmsPageOptions } from '../../lib/cmhcRmsPageOptions'
import type { CmhcRmsWorkbookCatalogEntry } from '../../lib/cmhcRmsWorkbookCatalog'
import { loadCmhcRmsWorkbookCatalog } from '../../lib/cmhcRmsWorkbookCatalog'

type SourceStatus = 'StandBy' | 'Running' | 'Success' | 'Error' | 'Skipped'

type SourceRow = {
  geography: string
  status: SourceStatus
  detail?: string
  rowCount?: number
}

const logKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const sheetNamesFromBuffer = (buffer: ArrayBuffer): string[] => {
  const wb = XLSX.read(buffer, { type: 'array' })
  return [...wb.SheetNames]
}

const EDIT_ROW_CAP = 500

const statusBadgeClass = (s: SourceStatus) => {
  switch (s) {
    case 'StandBy':
      return 'bg-slate-100 text-slate-700'
    case 'Running':
      return 'bg-amber-100 text-amber-950'
    case 'Success':
      return 'bg-emerald-100 text-emerald-900'
    case 'Skipped':
      return 'bg-slate-200 text-slate-600'
    case 'Error':
    default:
      return 'bg-red-100 text-red-900'
  }
}

export const CmhcRmsPipelinePanel = () => {
  const [editions, setEditions] = useState<number[]>([])
  const [surveyYear, setSurveyYear] = useState(2025)
  const [pageOptionsWarning, setPageOptionsWarning] = useState<string | null>(null)
  const [sourceRows, setSourceRows] = useState<SourceRow[]>([])
  const [catalog, setCatalog] = useState<CmhcRmsWorkbookCatalogEntry[] | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [logLines, setLogLines] = useState<{ id: string; text: string }[]>([])
  const [master, setMaster] = useState<CmhcRentRow[]>([])
  const [lastMerge, setLastMerge] = useState<{ total: number; conflicts: number } | null>(null)
  const [applyMessage, setApplyMessage] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const catalogRef = useRef<CmhcRmsWorkbookCatalogEntry[]>([])
  /** Passed into resume after sheet pick so tail downloads respect local buffers from a retry/run. */
  const pipelineLocalBuffersRef = useRef<Readonly<Record<string, ArrayBuffer>> | undefined>(undefined)
  /** When set, successful file_complete for this entry id clears the matching manual file (retry flow). */
  const manualClearEntryIdRef = useRef<string | null>(null)
  const [manualFiles, setManualFiles] = useState<Record<string, { name: string; buffer: ArrayBuffer }>>({})

  const [sheetPick, setSheetPick] = useState<{
    entry: CmhcRmsWorkbookCatalogEntry
    sheetNames: string[]
    expectedSheet: string
    buffer: ArrayBuffer
    master: CmhcRentRow[]
  } | null>(null)
  const [pickedSheet, setPickedSheet] = useState('')
  const [rememberSheet, setRememberSheet] = useState(true)

  const appendLog = useCallback((text: string) => {
    setLogLines((prev) => [...prev.slice(-400), { id: logKey(), text }])
  }, [])

  useEffect(() => {
    setCatalog(null)
    setSourceRows([])
    catalogRef.current = []
    setMaster([])
    setLastMerge(null)
    setManualFiles({})
  }, [surveyYear])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { editions: ed } = await loadCmhcRmsPageOptions()
        if (cancelled) return
        if (ed.length) {
          setEditions(ed)
          setSurveyYear(ed[0]!)
          setPageOptionsWarning(null)
        } else {
          const fb = fallbackEditionYears()
          setEditions(fb)
          setPageOptionsWarning('Could not read Edition years from CMHC page HTML; using fallback list.')
        }
      } catch (e) {
        if (cancelled) return
        setEditions(fallbackEditionYears())
        setPageOptionsWarning(
          e instanceof Error
            ? `${e.message} — using fallback years. For mobile/production, set VITE_LISTING_AGENT_URL to your listing server (GET /cmhc/rms-page-html).`
            : 'Failed to load CMHC page options.',
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const refreshPageOptions = useCallback(async () => {
    setPageOptionsWarning(null)
    setCatalogError(null)
    try {
      const { editions: ed, geographies } = await loadCmhcRmsPageOptions()
      if (ed.length) setEditions(ed)
      appendLog(`Page options: ${ed.length} edition(s), ${geographies.length} geography option(s) in HTML.`)
      if (!ed.includes(surveyYear) && ed.length) setSurveyYear(ed[0]!)
    } catch (e) {
      setPageOptionsWarning(e instanceof Error ? e.message : String(e))
    }
  }, [appendLog, surveyYear])

  const loadCatalog = useCallback(async () => {
    setCatalogError(null)
    try {
      const { geographies } = await loadCmhcRmsPageOptions()
      if (!geographies.length) throw new Error('No Geography options found in CMHC page HTML.')
      setSourceRows(geographies.map((g) => ({ geography: g, status: 'StandBy' as const })))
      const c = buildCatalogFromGeographies(geographies, surveyYear)
      setCatalog(c)
      catalogRef.current = c
      setMaster([])
      setLastMerge(null)
      appendLog(`Loaded catalogue: ${geographies.length} geography source(s) for ${surveyYear} (StandBy).`)
    } catch (e) {
      setSourceRows([])
      setCatalog(null)
      catalogRef.current = []
      setCatalogError(e instanceof Error ? e.message : String(e))
    }
  }, [appendLog, surveyYear])

  const updateSourceByLabel = useCallback((label: string, patch: Partial<Omit<SourceRow, 'geography'>>) => {
    setSourceRows((prev) =>
      prev.map((r) => (r.geography === label ? { ...r, ...patch } : r)),
    )
  }, [])

  const labelForEntryId = useCallback((entryId: string) => catalogRef.current.find((c) => c.id === entryId)?.label, [])

  const entryForGeography = useCallback(
    (geographyLabel: string): CmhcRmsWorkbookCatalogEntry =>
      catalogRef.current.find((c) => c.label === geographyLabel) ?? geographyToCatalogEntry(geographyLabel, surveyYear),
    [surveyYear],
  )

  const handlePipelineEvent = useCallback(
    (e: CmhcPipelineEvent) => {
      if (e.kind === 'file_start') {
        updateSourceByLabel(e.entry.label, { status: 'Running', detail: undefined })
        appendLog(`— ${e.entry.label} (${e.index + 1}/${e.total})`)
        return
      }
      if (e.kind === 'file_complete') {
        const label = labelForEntryId(e.entryId)
        if (label) updateSourceByLabel(label, { status: 'Success', rowCount: e.rowCount, detail: undefined })
        if (manualClearEntryIdRef.current === e.entryId) {
          manualClearEntryIdRef.current = null
          setManualFiles((prev) => {
            if (!(e.entryId in prev)) return prev
            const next = { ...prev }
            delete next[e.entryId]
            return next
          })
        }
        appendLog(`Done ${e.entryId}: ${e.rowCount} rows`)
        return
      }
      if (e.kind === 'file_error') {
        if (manualClearEntryIdRef.current === e.entry.id) {
          manualClearEntryIdRef.current = null
        }
        const is404 = e.message.includes('404')
        updateSourceByLabel(e.entry.label, {
          status: is404 ? 'Skipped' : 'Error',
          detail: e.message,
        })
        appendLog(`ERROR ${e.entry.label}: ${e.message}`)
        return
      }
      if (e.kind === 'master_updated') {
        setMaster(e.rows)
        return
      }
      if (e.kind === 'log') {
        appendLog(e.message)
        return
      }
      if (e.kind === 'merge_complete') {
        setLastMerge({ total: e.totalRows, conflicts: e.conflicts })
        appendLog(`Merge complete: ${e.totalRows} rows, ${e.conflicts} key overwrites.`)
      }
    },
    [appendLog, labelForEntryId, updateSourceByLabel],
  )

  const runPipeline = useCallback(async () => {
    let c = catalog
    if (!c?.length) {
      try {
        const { geographies } = await loadCmhcRmsPageOptions()
        if (!geographies.length) throw new Error('Load catalogue first (no geographies).')
        const built = buildCatalogFromGeographies(geographies, surveyYear)
        setCatalog(built)
        catalogRef.current = built
        c = built
        setSourceRows((prev) => {
          if (prev.length === geographies.length && prev.every((r, i) => r.geography === geographies[i])) {
            return prev.map((r) => ({ ...r, status: 'StandBy' as const, detail: undefined, rowCount: undefined }))
          }
          return geographies.map((g) => ({ geography: g, status: 'StandBy' as const }))
        })
      } catch (e) {
        try {
          c = await loadCmhcRmsWorkbookCatalog(surveyYear)
          setCatalog(c)
          catalogRef.current = c
          setSourceRows(
            c.map((entry) => ({
              geography: entry.label,
              status: 'StandBy' as const,
            })),
          )
          appendLog(`Using static public/data/cmhc-rms-workbooks-${surveyYear}.json (${c.length} file(s)).`)
        } catch (e2) {
          setCatalogError(e instanceof Error ? e.message : String(e))
          return
        }
      }
    } else {
      catalogRef.current = c
      setSourceRows((prev) =>
        prev.length
          ? prev.map((r) => ({ ...r, status: 'StandBy', detail: undefined, rowCount: undefined }))
          : c!.map((entry) => ({ geography: entry.label, status: 'StandBy' as const })),
      )
    }

    if (!c?.length) return
    catalogRef.current = c

    setBusy(true)
    setApplyMessage(null)
    setLogLines([])
    setMaster([])
    setLastMerge(null)
    setSheetPick(null)
    pipelineLocalBuffersRef.current = undefined
    manualClearEntryIdRef.current = null
    abortRef.current = new AbortController()

    try {
      const result = await runCmhcPipeline({
        surveyYear,
        catalog: c,
        signal: abortRef.current.signal,
        onEvent: handlePipelineEvent,
      })

      if (result.pendingSheetChoice) {
        const exp = result.pendingSheetChoice.entry.defaultSheet
        const names = sheetNamesFromBuffer(result.pendingSheetChoice.buffer)
        setSheetPick({
          entry: result.pendingSheetChoice.entry,
          sheetNames: names,
          expectedSheet: exp,
          buffer: result.pendingSheetChoice.buffer,
          master: result.rows,
        })
        setPickedSheet(names.includes(exp) ? exp : (names[0] ?? ''))
        return
      }

      setMaster(result.rows)
      if (!result.aborted) {
        appendLog(result.rows.length ? `Finished: ${result.rows.length} rows in master.` : 'No rows.')
      }
    } catch (e) {
      appendLog(e instanceof Error ? e.message : String(e))
    } finally {
      pipelineLocalBuffersRef.current = undefined
      setBusy(false)
    }
  }, [appendLog, catalog, handlePipelineEvent, surveyYear])

  const retrySourceGeography = useCallback(
    async (geographyLabel: string) => {
      const entry = entryForGeography(geographyLabel)
      const manual = manualFiles[entry.id]
      const localMap = manual ? { [entry.id]: manual.buffer } : undefined
      pipelineLocalBuffersRef.current = localMap
      manualClearEntryIdRef.current = entry.id

      setBusy(true)
      setApplyMessage(null)
      setSheetPick(null)
      abortRef.current = new AbortController()
      updateSourceByLabel(geographyLabel, { status: 'Running', detail: undefined })
      appendLog(`Retry: ${entry.label}${manual ? ' (local file)' : ''}`)

      try {
        const result = await runCmhcPipeline({
          surveyYear,
          catalog: [entry],
          initialRows: master,
          signal: abortRef.current.signal,
          onEvent: handlePipelineEvent,
          localBuffersByEntryId: localMap,
        })

        if (result.pendingSheetChoice) {
          const exp = result.pendingSheetChoice.entry.defaultSheet
          const names = sheetNamesFromBuffer(result.pendingSheetChoice.buffer)
          setSheetPick({
            entry: result.pendingSheetChoice.entry,
            sheetNames: names,
            expectedSheet: exp,
            buffer: result.pendingSheetChoice.buffer,
            master: result.rows,
          })
          setPickedSheet(names.includes(exp) ? exp : (names[0] ?? ''))
          return
        }

        setMaster(result.rows)
        if (!result.aborted) {
          appendLog(result.rows.length ? `Retry finished: ${result.rows.length} rows in master.` : 'Retry finished (no rows).')
        }
      } catch (e) {
        manualClearEntryIdRef.current = null
        appendLog(e instanceof Error ? e.message : String(e))
        updateSourceByLabel(geographyLabel, {
          status: 'Error',
          detail: e instanceof Error ? e.message : String(e),
        })
      } finally {
        pipelineLocalBuffersRef.current = undefined
        setBusy(false)
      }
    },
    [appendLog, entryForGeography, handlePipelineEvent, manualFiles, master, surveyYear, updateSourceByLabel],
  )

  const continueAfterSheetPick = async () => {
    if (!sheetPick || !pickedSheet) return
    let cat = catalog
    if (!cat?.length) {
      cat = catalogRef.current
    }
    if (!cat?.length) return
    setBusy(true)
    setApplyMessage(null)
    const ctx: PipelineResumeContext = {
      entry: sheetPick.entry,
      buffer: sheetPick.buffer,
      surveyYear,
      sheetName: pickedSheet,
      index: 0,
      total: cat.length,
    }
    try {
      const { rows, pendingSheetChoice } = await resumePipelineAfterSheetChoice(ctx, pickedSheet, {
        catalog: cat,
        master: sheetPick.master,
        rememberSheet,
        onEvent: handlePipelineEvent,
        signal: abortRef.current?.signal,
        localBuffersByEntryId: pipelineLocalBuffersRef.current,
      })
      setMaster(rows)
      setSheetPick(null)
      if (pendingSheetChoice) {
        setSheetPick({
          entry: pendingSheetChoice.entry,
          sheetNames: sheetNamesFromBuffer(pendingSheetChoice.buffer),
          expectedSheet: pendingSheetChoice.entry.defaultSheet,
          buffer: pendingSheetChoice.buffer,
          master: rows,
        })
        setPickedSheet(pendingSheetChoice.entry.defaultSheet)
        setBusy(false)
        return
      }
      appendLog(rows.length ? `Finished: ${rows.length} rows in master.` : 'No rows.')
    } catch (e) {
      appendLog(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const stopRun = () => {
    abortRef.current?.abort()
    appendLog('Aborted.')
  }

  const applyToDataset = async () => {
    if (master.length === 0) return
    setApplyMessage(null)
    setBusy(true)
    try {
      const ds = await getActiveDataset()
      if (!ds) throw new Error('No active dataset.')
      await saveDataset({ ...ds, rents: master })
      const r = await runCategoryMonthlyFetch('monthly-rents')
      if (!r.ok) throw new Error(r.error ?? 'Monthly rebuild failed')
      setApplyMessage(`Applied ${master.length} rent rows and rebuilt monthly rents.`)
    } catch (e) {
      setApplyMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const downloadJson = () => {
    const blob = new Blob([`${JSON.stringify(master, null, 2)}\n`], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `cmhc-rents-merged-${surveyYear}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const patchMasterRow = (index: number, patch: Partial<CmhcRentRow>) => {
    setMaster((prev) => {
      const next = [...prev]
      const cur = next[index]
      if (!cur) return prev
      next[index] = { ...cur, ...patch }
      return next
    })
  }

  const qualityLegend = useMemo(
    () =>
      Object.entries(CMHC_RENT_QUALITY_LABELS)
        .map(([k, v]) => `${k} — ${v}`)
        .join(' · '),
    [],
  )

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">CMHC RMS multi-workbook pipeline</h3>
        <p className="mt-1 text-sm text-slate-600">
          Edition and Geography lists are read from the CMHC page HTML (<code className="rounded bg-slate-100 px-1">pdf_edition</code>,{' '}
          <code className="rounded bg-slate-100 px-1">pdf_geo</code>). Dev uses the Vite{' '}
          <code className="rounded bg-slate-100 px-1">/cmhc-www</code> proxy; production/mobile can use{' '}
          <code className="rounded bg-slate-100 px-1">VITE_LISTING_AGENT_URL</code> + GET{' '}
          <code className="rounded bg-slate-100 px-1">/cmhc/rms-page-html</code>. Workbook downloads use the existing{' '}
          <code className="rounded bg-slate-100 px-1">/cmhc-assets</code> proxy in dev. Quality legend: {qualityLegend}
        </p>
      </div>

      {pageOptionsWarning ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{pageOptionsWarning}</p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Edition (year)</span>
          <select
            className="min-w-[7rem] rounded-lg border border-slate-200 bg-white px-2 py-1.5"
            value={surveyYear}
            onChange={(e) => setSurveyYear(Number(e.target.value) || 2025)}
          >
            {(editions.length ? editions : fallbackEditionYears()).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void refreshPageOptions()}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
        >
          Refresh page options
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadCatalog()}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
        >
          Load catalogue
        </button>
        <button
          type="button"
          disabled={busy || !!sheetPick}
          onClick={() => void runPipeline()}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Run pipeline
        </button>
        <button
          type="button"
          disabled={!busy}
          onClick={stopRun}
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900 hover:bg-red-100 disabled:opacity-40"
        >
          Stop
        </button>
      </div>

      {catalogError ? <p className="text-sm text-red-700">{catalogError}</p> : null}

      {sourceRows.length > 0 ? (
        <div>
          <h4 className="text-sm font-semibold text-slate-800">Source status</h4>
          <p className="mt-1 text-xs text-slate-500">
            For <strong>Error</strong> or <strong>Skipped</strong>, choose a local .xlsx (optional) and <strong>Retry</strong>. Retry merges into the
            current master (duplicate keys are replaced).
          </p>
          <div className="mt-2 max-h-[min(24rem,70vh)] overflow-auto rounded-md border border-slate-200">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-2 py-1.5">Geography</th>
                  <th className="px-2 py-1.5">Status</th>
                  <th className="px-2 py-1.5">Rows</th>
                  <th className="px-2 py-1.5">Detail</th>
                  <th className="px-2 py-1.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sourceRows.map((r) => {
                  const entryId = entryForGeography(r.geography).id
                  const manual = manualFiles[entryId]
                  const canRetry = r.status === 'Error' || r.status === 'Skipped'
                  const actionsDisabled = busy || !!sheetPick
                  return (
                    <tr key={r.geography} className="text-slate-800">
                      <td className="px-2 py-1">{r.geography}</td>
                      <td className="px-2 py-1">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(r.status)}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-2 py-1">{r.rowCount ?? '—'}</td>
                      <td className="max-w-[12rem] break-words px-2 py-1 text-slate-600">{r.detail ?? '—'}</td>
                      <td className="px-2 py-1 align-top">
                        {canRetry ? (
                          <div className="flex min-w-[10rem] flex-col gap-1">
                            <label className="text-[11px] font-medium text-slate-600">
                              Local .xlsx
                              <input
                                type="file"
                                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                disabled={actionsDisabled}
                                className="mt-0.5 block w-full max-w-[11rem] text-[11px] file:mr-1 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-0.5"
                                onChange={async (ev) => {
                                  const f = ev.target.files?.[0]
                                  ev.target.value = ''
                                  if (!f) return
                                  const buf = await f.arrayBuffer()
                                  setManualFiles((prev) => ({
                                    ...prev,
                                    [entryId]: { name: f.name, buffer: buf },
                                  }))
                                }}
                              />
                            </label>
                            {manual ? (
                              <span className="flex flex-wrap items-center gap-1 text-[11px] text-slate-600">
                                <span className="truncate" title={manual.name}>
                                  {manual.name}
                                </span>
                                <button
                                  type="button"
                                  disabled={actionsDisabled}
                                  className="shrink-0 rounded text-violet-700 underline"
                                  onClick={() =>
                                    setManualFiles((prev) => {
                                      const next = { ...prev }
                                      delete next[entryId]
                                      return next
                                    })
                                  }
                                >
                                  Clear
                                </button>
                              </span>
                            ) : null}
                            <button
                              type="button"
                              disabled={actionsDisabled}
                              onClick={() => void retrySourceGeography(r.geography)}
                              className="rounded-md bg-slate-800 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                            >
                              Retry
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {sheetPick ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4">
          <p className="text-sm font-semibold text-amber-950">
            Expected sheet &quot;{sheetPick.expectedSheet}&quot; not found in {sheetPick.entry.label}. Pick a tab:
          </p>
          <select
            className="mt-2 w-full max-w-md rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
            value={pickedSheet}
            onChange={(e) => setPickedSheet(e.target.value)}
          >
            {sheetPick.sheetNames.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={rememberSheet} onChange={(e) => setRememberSheet(e.target.checked)} />
            Remember for this workbook (local storage)
          </label>
          <button
            type="button"
            disabled={busy || !pickedSheet}
            onClick={() => void continueAfterSheetPick()}
            className="mt-3 rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
          >
            Continue with selected sheet
          </button>
        </div>
      ) : null}

      {lastMerge ? (
        <p className="text-sm text-slate-700">
          Last merge: <strong>{lastMerge.total}</strong> rows, <strong>{lastMerge.conflicts}</strong> duplicate keys overwritten.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={master.length === 0 || busy}
          onClick={() => void applyToDataset()}
          className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
        >
          Apply to active dataset
        </button>
        <button
          type="button"
          disabled={master.length === 0}
          onClick={downloadJson}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Download JSON
        </button>
      </div>
      {applyMessage ? <p className="text-sm text-slate-700">{applyMessage}</p> : null}

      <div>
        <h4 className="text-sm font-semibold text-slate-800">
          Master table ({master.length} rows) — editable first {EDIT_ROW_CAP}
        </h4>
        <div className="mt-2 max-h-[min(50vh,420px)] overflow-auto rounded-md border border-slate-200">
          <table className="min-w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-100 text-slate-700">
              <tr>
                <th className="px-2 py-1.5">Province</th>
                <th className="px-2 py-1.5">City</th>
                <th className="px-2 py-1.5">BR</th>
                <th className="px-2 py-1.5">Structure</th>
                <th className="px-2 py-1.5">Rent</th>
                <th className="px-2 py-1.5">Q</th>
                <th className="px-2 py-1.5">Year</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {master.slice(0, EDIT_ROW_CAP).map((r, idx) => (
                <tr key={`${r.province}-${r.city}-${r.bedrooms}-${r.structureType}-${idx}`} className="text-slate-800">
                  <td className="px-2 py-1">{r.province}</td>
                  <td className="px-2 py-1">{r.city}</td>
                  <td className="px-2 py-1">{r.bedrooms}</td>
                  <td className="px-2 py-1">{r.structureType}</td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      className="w-20 rounded border border-slate-200 px-1 py-0.5"
                      value={Number.isFinite(r.avgRent) ? r.avgRent : ''}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        if (Number.isFinite(v)) patchMasterRow(idx, { avgRent: v })
                      }}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <select
                      className="max-w-[4rem] rounded border border-slate-200 px-1 py-0.5"
                      value={r.rentQualityGrade ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        patchMasterRow(idx, {
                          rentQualityGrade: v === '' ? undefined : (v as CmhcRentQualityGrade),
                        })
                      }}
                    >
                      <option value="">—</option>
                      <option value="a">a</option>
                      <option value="b">b</option>
                      <option value="c">c</option>
                      <option value="d">d</option>
                    </select>
                  </td>
                  <td className="px-2 py-1">{r.surveyYear}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {master.length > EDIT_ROW_CAP ? (
            <p className="border-t border-slate-100 bg-slate-50 px-2 py-1 text-xs text-slate-500">
              {master.length - EDIT_ROW_CAP} more row(s) not shown in the grid; use Download JSON to edit in bulk.
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-800">Log</h4>
        <div className="mt-1 max-h-36 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] text-slate-700">
          {logLines.map((l) => (
            <div key={l.id}>{l.text}</div>
          ))}
        </div>
      </div>
    </section>
  )
}
