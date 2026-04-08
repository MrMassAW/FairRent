import { useCallback, useEffect, useMemo, useState } from 'react'
import { CMHC_URBAN_CENTRES_BY_PROVINCE } from '../../data/cmhcUrbanCentres'
import type { CmhcRentQualityGrade, CmhcRentRow } from '../../data/cmhcRents'
import {
  deleteRentByCmaMonthly,
  deleteUtilityPriceMonthly,
  getGeoDistanceReductionPolicy,
  getActiveDataset,
  getAvailableHistoryMonths,
  readFullMonthlyHistory,
  rebuildMonthlyFromActiveDataset,
  resetAdminDatabase,
  saveDataset,
  setGeoDistanceReductionPolicy,
  upsertRentByCmaMonthly,
  upsertUtilityPriceMonthly,
} from '../../lib/adminDataStore'
import type { GeoDistanceReductionPolicy } from '../../types/adminData'
import { geocodeBatchGeocodio, chunked, isGeocodioConfigured, sleep } from '../../lib/geocode'
import type {
  RentByCmaMonthly,
  RentDatasetSet,
  UtilityPriceMonthly,
} from '../../types/adminData'

const PROVINCE_CODES = Object.keys(CMHC_URBAN_CENTRES_BY_PROVINCE).sort()

const normalizeCityKey = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

function makeRentMonthlyId(row: Pick<RentByCmaMonthly, 'month' | 'province' | 'cma' | 'bedrooms'>): string {
  return `${row.month}|${row.province}|${row.cma}|${row.bedrooms}`
}

function makeUtilityId(row: Pick<UtilityPriceMonthly, 'month' | 'province' | 'city'>): string {
  return `${row.month}|${row.province}|${row.city}`
}

type TabId = 'dataset' | 'coverage' | 'monthly-rents' | 'utilities'

export type AdminDatabaseEditorVariant = 'full' | 'rental' | 'utilities'

const ALL_EDITOR_TABS: { id: TabId; label: string }[] = [
  { id: 'dataset', label: 'CMHC dataset' },
  { id: 'coverage', label: 'Catalog coverage' },
  { id: 'monthly-rents', label: 'Monthly rents' },
  { id: 'utilities', label: 'Utilities' },
]

const RENTAL_EDITOR_TABS: { id: TabId; label: string }[] = [
  { id: 'dataset', label: 'CMHC dataset' },
  { id: 'coverage', label: 'Catalog coverage' },
]

export type AdminDatabaseEditorProps = {
  variant?: AdminDatabaseEditorVariant
}

export const AdminDatabaseEditor = ({ variant = 'full' }: AdminDatabaseEditorProps) => {
  const [tab, setTab] = useState<TabId>('dataset')
  const [dataset, setDataset] = useState<RentDatasetSet | null>(null)
  const [datasetDirty, setDatasetDirty] = useState(false)
  const [datasetMessage, setDatasetMessage] = useState<string>('')
  const [rebuildBusy, setRebuildBusy] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)

  const [provinceFilter, setProvinceFilter] = useState<string>('ALL')
  const [citySearch, setCitySearch] = useState('')
  const [coverageProvince, setCoverageProvince] = useState('QC')

  const [months, setMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [monthlyRents, setMonthlyRents] = useState<RentByCmaMonthly[]>([])
  const [utilities, setUtilities] = useState<UtilityPriceMonthly[]>([])
  const [monthlyProvinceFilter, setMonthlyProvinceFilter] = useState<string>('ALL')
  const [monthlyMessage, setMonthlyMessage] = useState<string>('')

  const [geoPolicy, setGeoPolicy] = useState<GeoDistanceReductionPolicy | null>(null)
  const [geoPolicyMessage, setGeoPolicyMessage] = useState<string>('')
  const [geocodeBusy, setGeocodeBusy] = useState(false)
  const [geocodeProgress, setGeocodeProgress] = useState<{ done: number; total: number; ok: number; failed: number } | null>(
    null,
  )
  const [geocodeErrors, setGeocodeErrors] = useState<string[]>([])
  /** Shown next to the Geocode button (monthlyMessage is hidden on some tabs). */
  const [geocodeStatusMessage, setGeocodeStatusMessage] = useState<string>('')

  const editorTabs = useMemo(() => {
    if (variant === 'rental') return RENTAL_EDITOR_TABS
    if (variant === 'utilities') return []
    return ALL_EDITOR_TABS
  }, [variant])

  const loadDatasets = useCallback(async () => {
    const active = await getActiveDataset()
    setDataset(active ?? null)
    setDatasetDirty(false)
  }, [])

  useEffect(() => {
    void loadDatasets()
  }, [loadDatasets])

  const loadMonths = useCallback(async () => {
    const m = await getAvailableHistoryMonths()
    setMonths(m)
    if (m.length) {
      setSelectedMonth((prev) => (prev && m.includes(prev) ? prev : m[0]))
    }
  }, [])

  useEffect(() => {
    if (variant === 'rental' && (tab === 'utilities' || tab === 'monthly-rents')) {
      setTab('dataset')
    }
  }, [variant, tab])

  useEffect(() => {
    const needsMonthlyHistory =
      variant === 'rental' ||
      variant === 'utilities' ||
      tab === 'monthly-rents' ||
      tab === 'utilities'
    if (needsMonthlyHistory) {
      void loadMonths()
      void readFullMonthlyHistory().then(({ rentsByCma, utilityPrices }) => {
        setMonthlyRents(rentsByCma)
        setUtilities(utilityPrices)
      })
    }
  }, [tab, loadMonths, variant])

  useEffect(() => {
    void getGeoDistanceReductionPolicy().then((p) => setGeoPolicy(p))
  }, [])

  const saveGeoPolicy = async () => {
    if (!geoPolicy) return
    setGeoPolicyMessage('')
    try {
      await setGeoDistanceReductionPolicy(geoPolicy)
      setGeoPolicyMessage('Saved.')
    } catch (e) {
      setGeoPolicyMessage(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const geocodeAllCmas = async () => {
    setMonthlyMessage('')
    setGeocodeStatusMessage('')
    if (!isGeocodioConfigured()) {
      const msg = 'Geocoding not configured: set VITE_GEOCODIO_API_KEY in .env and restart Vite.'
      setMonthlyMessage(msg)
      setGeocodeStatusMessage(msg)
      return
    }
    setGeocodeStatusMessage('Loading monthly rent rows…')
    const sourceMonthlyRents =
      monthlyRents.length > 0 ? monthlyRents : (await readFullMonthlyHistory()).rentsByCma
    if (sourceMonthlyRents.length === 0) {
      const msg = 'No monthly rent rows in IndexedDB yet. Run “Rebuild monthly tables from dataset” on the CMHC dataset tab.'
      setMonthlyMessage(msg)
      setGeocodeStatusMessage(msg)
      return
    }
    setGeocodeBusy(true)
    setGeocodeErrors([])
    setGeocodeProgress(null)
    try {
      const uniqueKey = (r: Pick<RentByCmaMonthly, 'province' | 'cma'>) => `${r.province.toUpperCase()}|${r.cma}`
      const unique = new Map<string, { province: string; cma: string }>()
      sourceMonthlyRents.forEach((r) => {
        const k = uniqueKey(r)
        if (!unique.has(k)) unique.set(k, { province: r.province, cma: r.cma })
      })
      const items = Array.from(unique.values())
      const queries = items.map((x) => `${x.cma}, ${x.province}, Canada`)

      setGeocodeProgress({ done: 0, total: queries.length, ok: 0, failed: 0 })
      setGeocodeStatusMessage(`Geocoding ${queries.length} unique CMAs…`)

      const resultsByKey = new Map<string, { lat?: number; lng?: number; err?: string }>()
      const batches = chunked(queries.map((q, idx) => ({ q, idx })), 75)
      for (const batch of batches) {
        const res = await geocodeBatchGeocodio(batch.map((b) => b.q))
        res.forEach((r, i) => {
          const idx = batch[i].idx
          const it = items[idx]
          const k = uniqueKey(it)
          if (r.ok && r.lat !== undefined && r.lng !== undefined) {
            resultsByKey.set(k, { lat: r.lat, lng: r.lng })
          } else {
            resultsByKey.set(k, { err: r.error ?? 'Unknown error' })
          }
        })
        const ok = Array.from(resultsByKey.values()).filter((x) => x.lat !== undefined && x.lng !== undefined).length
        const failed = resultsByKey.size - ok
        setGeocodeProgress({ done: resultsByKey.size, total: queries.length, ok, failed })
        // Friendly delay between batches.
        await sleep(600)
      }

      const updated = sourceMonthlyRents.map((r) => {
        const k = uniqueKey(r)
        const hit = resultsByKey.get(k)
        if (hit?.lat !== undefined && hit.lng !== undefined) {
          return { ...r, lat: hit.lat, lng: hit.lng }
        }
        return r
      })

      setGeocodeStatusMessage(`Saving ${updated.length} rows to IndexedDB…`)
      // Persist updates row-by-row to IndexedDB.
      // (Keep this simple; volume is manageable for typical datasets.)
      for (const row of updated) {
        await upsertRentByCmaMonthly(row)
      }
      setMonthlyRents(updated)

      const errors = Array.from(resultsByKey.entries())
        .filter(([, v]) => v.err)
        .slice(0, 200)
        .map(([k, v]) => `${k}: ${v.err}`)
      setGeocodeErrors(errors)

      const okCount = Array.from(resultsByKey.values()).filter((x) => x.lat !== undefined && x.lng !== undefined).length
      const failedCount = resultsByKey.size - okCount
      const summary = `Geocoding complete: ${resultsByKey.size} unique CMAs · ok=${okCount} · failed=${failedCount}.`
      setMonthlyMessage(summary)
      setGeocodeStatusMessage(summary)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Geocoding failed'
      setMonthlyMessage(msg)
      setGeocodeStatusMessage(msg)
    } finally {
      setGeocodeBusy(false)
    }
  }

  const latestSurveyYear = useMemo(() => {
    if (!dataset?.rents.length) return new Date().getFullYear()
    return Math.max(...dataset.rents.map((r) => r.surveyYear))
  }, [dataset])

  const provinceOptions = useMemo(() => {
    const set = new Set<string>(PROVINCE_CODES)
    dataset?.rents.forEach((r) => set.add(r.province))
    return Array.from(set).sort()
  }, [dataset])

  const monthlyProvinceOptions = useMemo(() => {
    const set = new Set<string>(PROVINCE_CODES)
    monthlyRents.forEach((r) => set.add(r.province))
    utilities.forEach((r) => set.add(r.province))
    return Array.from(set).sort()
  }, [monthlyRents, utilities])

  const filteredRentRows = useMemo(() => {
    if (!dataset) return []
    const q = citySearch.trim().toLowerCase()
    return dataset.rents
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => {
        if (provinceFilter !== 'ALL' && row.province !== provinceFilter) return false
        if (q && !row.city.toLowerCase().includes(q)) return false
        return true
      })
  }, [dataset, provinceFilter, citySearch])

  const coverageRows = useMemo(() => {
    if (!dataset) return []
    const catalog = CMHC_URBAN_CENTRES_BY_PROVINCE[coverageProvince] ?? []
    const byNorm = new Map<string, CmhcRentRow[]>()
    for (const r of dataset.rents.filter((x) => x.province === coverageProvince)) {
      const k = normalizeCityKey(r.city)
      if (!byNorm.has(k)) byNorm.set(k, [])
      byNorm.get(k)!.push(r)
    }
    return catalog.map((city) => {
      const k = normalizeCityKey(city)
      const hit = byNorm.get(k)
      return {
        city,
        covered: Boolean(hit?.length),
        matchedDatasetName: hit?.[0]?.city,
        rowCount: hit?.length ?? 0,
      }
    })
  }, [dataset, coverageProvince])

  const coverageStats = useMemo(() => {
    const total = coverageRows.length
    const covered = coverageRows.filter((r) => r.covered).length
    return { total, covered, missing: total - covered }
  }, [coverageRows])

  const filteredMonthlyRents = useMemo(() => {
    return monthlyRents.filter((r) => {
      if (selectedMonth && r.month !== selectedMonth) return false
      if (monthlyProvinceFilter !== 'ALL' && r.province !== monthlyProvinceFilter) return false
      return true
    })
  }, [monthlyRents, selectedMonth, monthlyProvinceFilter])

  const filteredUtilities = useMemo(() => {
    return utilities.filter((r) => {
      if (selectedMonth && r.month !== selectedMonth) return false
      if (monthlyProvinceFilter !== 'ALL' && r.province !== monthlyProvinceFilter) return false
      return true
    })
  }, [utilities, selectedMonth, monthlyProvinceFilter])

  const saveDatasetNow = async () => {
    if (!dataset) return
    setDatasetMessage('')
    try {
      await saveDataset(dataset)
      setDatasetDirty(false)
      setDatasetMessage('Saved.')
    } catch (e) {
      setDatasetMessage(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const updateRentRow = (idx: number, patch: Partial<CmhcRentRow>) => {
    if (!dataset) return
    setDataset((current) => {
      if (!current) return current
      const rents = [...current.rents]
      rents[idx] = { ...rents[idx], ...patch }
      return { ...current, rents }
    })
    setDatasetDirty(true)
  }

  const addRentRow = () => {
    if (!dataset) return
    const row: CmhcRentRow = {
      province: coverageProvince || 'QC',
      city: 'Montréal',
      bedrooms: 1,
      structureType: 'purpose-built',
      avgRent: 0,
      surveyYear: latestSurveyYear,
    }
    setDataset((current) => (current ? { ...current, rents: [...current.rents, row] } : current))
    setDatasetDirty(true)
  }

  const removeRentRow = (idx: number) => {
    if (!dataset) return
    setDataset((current) => {
      if (!current) return current
      const rents = current.rents.filter((_, i) => i !== idx)
      return { ...current, rents }
    })
    setDatasetDirty(true)
  }

  const addStubFromCatalog = (catalogCity: string) => {
    if (!dataset) return
    const row: CmhcRentRow = {
      province: coverageProvince,
      city: catalogCity,
      bedrooms: 1,
      structureType: 'purpose-built',
      avgRent: 0,
      surveyYear: latestSurveyYear,
    }
    setDataset((current) => (current ? { ...current, rents: [...current.rents, row] } : current))
    setDatasetDirty(true)
  }

  const onRebuildMonthly = async () => {
    try {
      setRebuildBusy(true)
      setDatasetMessage('')
      const at = await rebuildMonthlyFromActiveDataset()
      setDatasetMessage(`Monthly tables rebuilt (${at}).`)
      await loadMonths()
      const snap = await readFullMonthlyHistory()
      setMonthlyRents(snap.rentsByCma)
      setUtilities(snap.utilityPrices)
    } catch (e) {
      setDatasetMessage(e instanceof Error ? e.message : 'Rebuild failed')
    } finally {
      setRebuildBusy(false)
    }
  }

  const exportJson = async () => {
    const [active, monthly] = await Promise.all([getActiveDataset(), readFullMonthlyHistory()])
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            activeDataset: active ?? null,
            monthly,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    )
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `fairrent-admin-db-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const resetDb = async () => {
    const ok = window.confirm(
      'Reset local admin database?\n\nThis deletes all local datasets, monthly tables, and StatCan snapshots stored in your browser for this app.',
    )
    if (!ok) return
    setDatasetMessage('')
    try {
      setResetBusy(true)
      await resetAdminDatabase()
      await loadDatasets()
      setDatasetMessage('Local admin database reset. Seed dataset restored.')
    } catch (e) {
      setDatasetMessage(e instanceof Error ? e.message : 'Reset failed')
    } finally {
      setResetBusy(false)
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {variant === 'utilities'
              ? 'Utility price data'
              : variant === 'rental'
                ? 'Rental price data'
                : 'Local database editor'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {variant === 'utilities' ? (
              <>
                Browse and edit monthly utility multipliers stored in IndexedDB (electricity, natural gas, oil by province and
                city). Use <strong>Fetch new data</strong> above to refresh from upstream sources.
              </>
            ) : variant === 'rental' ? (
              <>
                Update the CMHC dataset, check catalog coverage, and edit monthly rent snapshots. The monthly rent table below is
                the live IndexedDB store used for calculator rent history. Default CMHC rows ship from{' '}
                <code className="rounded bg-slate-100 px-1">public/data/cmhc-rents.json</code> (national RMS Table 6.0 via{' '}
                <code className="rounded bg-slate-100 px-1">npm run data:cmhc-rms</code>).
              </>
            ) : (
              <>
                Browse and edit the IndexedDB calculator store (datasets, monthly CMHC rent snapshots, utilities). The
                default CMHC rows come from <code className="rounded bg-slate-100 px-1">public/data/cmhc-rents.json</code> (national RMS
                Table 6.0 via <code className="rounded bg-slate-100 px-1">npm run data:cmhc-rms</code>). The urban-centre catalog can still
                list centres without a matching row name until you align spelling or add manual stubs.
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 disabled:opacity-50"
            onClick={() => void exportJson()}
            disabled={resetBusy}
          >
            Export JSON snapshot
          </button>
          <button
            type="button"
            className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-900 disabled:opacity-50"
            onClick={() => void resetDb()}
            disabled={resetBusy}
          >
            {resetBusy ? 'Resetting…' : 'Reset local DB'}
          </button>
        </div>
      </div>

      {editorTabs.length > 0 ? (
        <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
          {editorTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === t.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      {variant === 'rental' && (
        <div className="mb-4 space-y-2">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">Month</span>
              <select
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                {months.length === 0 ? (
                  <option value="">No monthly data yet</option>
                ) : (
                  months.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">Province</span>
              <select
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={monthlyProvinceFilter}
                onChange={(e) => setMonthlyProvinceFilter(e.target.value)}
              >
                <option value="ALL">All</option>
                {monthlyProvinceOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              onClick={() =>
                void readFullMonthlyHistory().then(({ rentsByCma, utilityPrices }) => {
                  setMonthlyRents(rentsByCma)
                  setUtilities(utilityPrices)
                  setMonthlyMessage('Reloaded from IndexedDB.')
                })
              }
            >
              Reload
            </button>
          </div>
          {monthlyMessage ? <p className="text-sm text-slate-600">{monthlyMessage}</p> : null}
        </div>
      )}

      {(variant === 'rental' || variant === 'full') && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-800">Geo fallback settings</h3>
          <p className="text-xs text-slate-600">
            Controls the stepwise distance reduction factor (with floor) used when a location cannot be matched and the app falls
            back to the nearest CMA.\n
          </p>
          {geoPolicy ? (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={geoPolicy.enabled}
                  onChange={(e) => setGeoPolicy((p) => (p ? { ...p, enabled: e.target.checked } : p))}
                />
                <span className="font-medium">Enable geographic closest-match fallback</span>
              </label>
              <div className="flex flex-wrap gap-3">
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">Floor factor</span>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={1.5}
                    className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    value={geoPolicy.floorFactor}
                    onChange={(e) =>
                      setGeoPolicy((p) => (p ? { ...p, floorFactor: Number(e.target.value) || 0 } : p))
                    }
                  />
                </label>
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">Max search km</span>
                  <input
                    type="number"
                    step="1"
                    min={0}
                    className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    value={geoPolicy.maxSearchKm ?? ''}
                    onChange={(e) =>
                      setGeoPolicy((p) =>
                        p
                          ? {
                              ...p,
                              maxSearchKm: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0),
                            }
                          : p,
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="h-10 rounded-md bg-slate-900 px-3 text-sm font-medium text-white"
                  onClick={() => void saveGeoPolicy()}
                >
                  Save geo policy
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-800">Distance bands (km → factor)</span>
                  <button
                    type="button"
                    className="text-sm text-blue-700 hover:underline"
                    onClick={() =>
                      setGeoPolicy((p) =>
                        p ? { ...p, bandsKm: [...p.bandsKm, { maxKm: 200, factor: p.floorFactor }] } : p,
                      )
                    }
                  >
                    Add band
                  </button>
                </div>
                <div className="space-y-2">
                  {geoPolicy.bandsKm.map((b, idx) => (
                    <div key={idx} className="flex flex-wrap items-end gap-2">
                      <label className="text-sm text-slate-700">
                        <span className="mb-1 block text-xs font-medium">Max km</span>
                        <input
                          type="number"
                          step="1"
                          min={0}
                          className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                          value={Number.isFinite(b.maxKm) ? b.maxKm : 0}
                          onChange={(e) => {
                            const maxKm = Number(e.target.value) || 0
                            setGeoPolicy((p) =>
                              p
                                ? {
                                    ...p,
                                    bandsKm: p.bandsKm.map((x, i) => (i === idx ? { ...x, maxKm } : x)),
                                  }
                                : p,
                            )
                          }}
                        />
                      </label>
                      <label className="text-sm text-slate-700">
                        <span className="mb-1 block text-xs font-medium">Factor</span>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          max={2}
                          className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                          value={b.factor}
                          onChange={(e) => {
                            const factor = Number(e.target.value) || 0
                            setGeoPolicy((p) =>
                              p
                                ? {
                                    ...p,
                                    bandsKm: p.bandsKm.map((x, i) => (i === idx ? { ...x, factor } : x)),
                                  }
                                : p,
                            )
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="h-10 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800"
                        onClick={() =>
                          setGeoPolicy((p) => (p ? { ...p, bandsKm: p.bandsKm.filter((_, i) => i !== idx) } : p))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2 border-t border-slate-200 pt-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 disabled:opacity-50"
                    onClick={() => void geocodeAllCmas()}
                    disabled={geocodeBusy}
                  >
                    {geocodeBusy ? 'Geocoding…' : 'Geocode all CMAs (Geocodio)'}
                  </button>
                  {geocodeProgress ? (
                    <span className="text-xs text-slate-600">
                      {geocodeProgress.done}/{geocodeProgress.total} · ok={geocodeProgress.ok} · failed={geocodeProgress.failed}
                    </span>
                  ) : null}
                </div>
                {geocodeStatusMessage ? <p className="text-sm text-slate-700">{geocodeStatusMessage}</p> : null}
                {geoPolicyMessage ? <p className="text-sm text-slate-600">{geoPolicyMessage}</p> : null}
                {geocodeErrors.length ? (
                  <details className="rounded border border-slate-200 bg-white p-2 text-xs text-slate-700">
                    <summary className="cursor-pointer font-medium text-slate-800">
                      Geocode errors ({geocodeErrors.length} shown)
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap break-words">{geocodeErrors.join('\n')}</pre>
                  </details>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Loading…</p>
          )}
        </div>
      )}

      {null}

      {variant === 'utilities' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">Month</span>
              <select
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                {months.length === 0 ? (
                  <option value="">No monthly data yet</option>
                ) : (
                  months.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">Province</span>
              <select
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={monthlyProvinceFilter}
                onChange={(e) => setMonthlyProvinceFilter(e.target.value)}
              >
                <option value="ALL">All</option>
                {monthlyProvinceOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              onClick={() =>
                void readFullMonthlyHistory().then(({ rentsByCma, utilityPrices }) => {
                  setMonthlyRents(rentsByCma)
                  setUtilities(utilityPrices)
                  setMonthlyMessage('Reloaded from IndexedDB.')
                })
              }
            >
              Reload
            </button>
          </div>
          {monthlyMessage ? <p className="text-sm text-slate-600">{monthlyMessage}</p> : null}
          <h3 className="text-sm font-semibold text-slate-800">Utility rows (IndexedDB)</h3>
          <UtilitiesTable
            wrapClassName="max-h-[min(70vh,720px)]"
            rows={filteredUtilities}
            onChange={async (next, oldId) => {
              if (oldId && oldId !== next.id) await deleteUtilityPriceMonthly(oldId)
              await upsertUtilityPriceMonthly(next)
              setUtilities((prev) => {
                const without = prev.filter((r) => r.id !== oldId && r.id !== next.id)
                return [...without, next]
              })
              setMonthlyMessage('Saved utility row.')
            }}
            onDelete={async (id) => {
              await deleteUtilityPriceMonthly(id)
              setUtilities((prev) => prev.filter((r) => r.id !== id))
              setMonthlyMessage('Deleted.')
            }}
          />
        </div>
      )}

      {variant !== 'utilities' && tab === 'dataset' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">Province</span>
              <select
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={provinceFilter}
                onChange={(e) => setProvinceFilter(e.target.value)}
              >
                <option value="ALL">All</option>
                {provinceOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-[12rem] flex-1 text-sm text-slate-700">
              <span className="mb-1 block font-medium">City contains</span>
              <input
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={citySearch}
                onChange={(e) => setCitySearch(e.target.value)}
                placeholder="Filter"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              disabled={!dataset || !datasetDirty}
              onClick={() => void saveDatasetNow()}
            >
              Save dataset
            </button>
            <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm" onClick={addRentRow}>
              Add row
            </button>
            <button
              type="button"
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 disabled:opacity-50"
              disabled={rebuildBusy}
              onClick={() => void onRebuildMonthly()}
            >
              {rebuildBusy ? 'Rebuilding…' : 'Rebuild monthly tables from dataset'}
            </button>
          </div>
          {datasetMessage ? <p className="text-sm text-slate-700">{datasetMessage}</p> : null}

          <div className="max-h-[min(60vh,560px)] overflow-auto rounded-md border border-slate-200">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-2 py-2 font-semibold">Prov</th>
                  <th className="px-2 py-2 font-semibold">City</th>
                  <th className="px-2 py-2 font-semibold">Beds</th>
                  <th className="px-2 py-2 font-semibold">Structure</th>
                  <th className="px-2 py-2 font-semibold">Avg rent</th>
                  <th className="px-2 py-2 font-semibold">Q</th>
                  <th className="px-2 py-2 font-semibold">Survey yr</th>
                  <th className="px-2 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {filteredRentRows.map(({ row, idx }) => (
                  <tr key={idx} className="border-t border-slate-100">
                    <td className="px-1 py-1">
                      <select
                        className="w-full rounded border border-slate-300 px-1 py-0.5"
                        value={row.province}
                        onChange={(e) => updateRentRow(idx, { province: e.target.value })}
                      >
                        {provinceOptions.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <input
                        className="w-full min-w-[8rem] rounded border border-slate-300 px-1 py-0.5"
                        value={row.city}
                        onChange={(e) => updateRentRow(idx, { city: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        min={0}
                        max={5}
                        className="w-14 rounded border border-slate-300 px-1 py-0.5"
                        value={row.bedrooms}
                        onChange={(e) => updateRentRow(idx, { bedrooms: Math.max(0, Math.min(5, Number(e.target.value) || 0)) })}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        className="w-full min-w-[8rem] rounded border border-slate-300 px-1 py-0.5"
                        value={row.structureType}
                        onChange={(e) => updateRentRow(idx, { structureType: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        min={0}
                        className="w-20 rounded border border-slate-300 px-1 py-0.5"
                        value={row.avgRent}
                        onChange={(e) => updateRentRow(idx, { avgRent: Math.max(0, Number(e.target.value) || 0) })}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <select
                        className="w-14 rounded border border-slate-300 px-1 py-0.5"
                        value={row.rentQualityGrade ?? ''}
                        onChange={(e) => {
                          const v = e.target.value
                          updateRentRow(idx, {
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
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        min={1990}
                        max={2100}
                        className="w-16 rounded border border-slate-300 px-1 py-0.5"
                        value={row.surveyYear}
                        onChange={(e) => updateRentRow(idx, { surveyYear: Number(e.target.value) || latestSurveyYear })}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <button
                        type="button"
                        className="text-red-700 hover:underline"
                        onClick={() => removeRentRow(idx)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dataset ? (
            <p className="text-xs text-slate-500">
              Showing {filteredRentRows.length} of {dataset.rents.length} rows in dataset.
            </p>
          ) : null}
        </div>
      )}

      {variant !== 'utilities' && tab === 'coverage' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Compares CMHC urban-centre catalog names to rows in the <strong>active dataset</strong> (accent-insensitive match).
            Missing rows are expected until you ingest a fuller CMHC export or add stubs manually.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">Province</span>
              <select
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={coverageProvince}
                onChange={(e) => setCoverageProvince(e.target.value)}
              >
                {PROVINCE_CODES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm text-slate-700">
              <span className="font-medium text-slate-900">{coverageStats.covered}</span> / {coverageStats.total} centres
              matched · <span className="text-amber-800">{coverageStats.missing}</span> without a rent row
            </p>
          </div>

          <div className="max-h-[min(55vh,480px)] overflow-auto rounded-md border border-slate-200">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-2 py-2 font-semibold">Catalog city</th>
                  <th className="px-2 py-2 font-semibold">Covered</th>
                  <th className="px-2 py-2 font-semibold">Dataset name</th>
                  <th className="px-2 py-2 font-semibold">Rows</th>
                  <th className="px-2 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {coverageRows.map((r) => (
                  <tr key={r.city} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">{r.city}</td>
                    <td className="px-2 py-1.5">{r.covered ? 'Yes' : '—'}</td>
                    <td className="px-2 py-1.5 text-slate-600">{r.matchedDatasetName ?? '—'}</td>
                    <td className="px-2 py-1.5">{r.rowCount}</td>
                    <td className="px-2 py-1.5">
                      {!r.covered ? (
                        <button
                          type="button"
                          className="text-blue-700 hover:underline"
                          onClick={() => addStubFromCatalog(r.city)}
                        >
                          Add stub row
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            After adding rows, use <strong>Save dataset</strong> on the CMHC dataset tab, then <strong>Rebuild monthly tables</strong>.
          </p>
        </div>
      )}

      {variant === 'full' && (tab === 'monthly-rents' || tab === 'utilities') && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">Month</span>
              <select
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                {months.length === 0 ? (
                  <option value="">No monthly data yet</option>
                ) : (
                  months.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">Province</span>
              <select
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={monthlyProvinceFilter}
                onChange={(e) => setMonthlyProvinceFilter(e.target.value)}
              >
                <option value="ALL">All</option>
                {monthlyProvinceOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              onClick={() =>
                void readFullMonthlyHistory().then(({ rentsByCma, utilityPrices }) => {
                  setMonthlyRents(rentsByCma)
                  setUtilities(utilityPrices)
                  setMonthlyMessage('Reloaded from IndexedDB.')
                })
              }
            >
              Reload
            </button>
          </div>
          {monthlyMessage ? <p className="text-sm text-slate-600">{monthlyMessage}</p> : null}

          {tab === 'monthly-rents' && (
            <MonthlyRentsTable
              wrapClassName="max-h-[min(55vh,480px)]"
              rows={filteredMonthlyRents}
              onChange={async (next, oldId) => {
                if (oldId && oldId !== next.id) await deleteRentByCmaMonthly(oldId)
                await upsertRentByCmaMonthly(next)
                setMonthlyRents((prev) => {
                  const withoutOld = oldId ? prev.filter((r) => r.id !== oldId) : prev
                  return [...withoutOld.filter((r) => r.id !== next.id), next]
                })
                setMonthlyMessage('Saved rent row.')
              }}
              onDelete={async (id) => {
                await deleteRentByCmaMonthly(id)
                setMonthlyRents((prev) => prev.filter((r) => r.id !== id))
                setMonthlyMessage('Deleted.')
              }}
            />
          )}

          {tab === 'utilities' && (
            <UtilitiesTable
              wrapClassName="max-h-[min(55vh,480px)]"
              rows={filteredUtilities}
              onChange={async (next, oldId) => {
                if (oldId && oldId !== next.id) await deleteUtilityPriceMonthly(oldId)
                await upsertUtilityPriceMonthly(next)
                setUtilities((prev) => {
                  const without = prev.filter((r) => r.id !== oldId && r.id !== next.id)
                  return [...without, next]
                })
                setMonthlyMessage('Saved utility row.')
              }}
              onDelete={async (id) => {
                await deleteUtilityPriceMonthly(id)
                setUtilities((prev) => prev.filter((r) => r.id !== id))
                setMonthlyMessage('Deleted.')
              }}
            />
          )}
        </div>
      )}

      {variant === 'rental' && (
        <div className="mt-8 space-y-3 border-t border-slate-200 pt-6">
          <h3 className="text-base font-semibold text-slate-900">Monthly rent rows (IndexedDB)</h3>
          <p className="text-sm text-slate-600">
            Rental price table used by the calculator. Month and province filters above apply here.
          </p>
          <MonthlyRentsTable
            wrapClassName="max-h-[min(70vh,720px)]"
            rows={filteredMonthlyRents}
            onChange={async (next, oldId) => {
              if (oldId && oldId !== next.id) await deleteRentByCmaMonthly(oldId)
              await upsertRentByCmaMonthly(next)
              setMonthlyRents((prev) => {
                const withoutOld = oldId ? prev.filter((r) => r.id !== oldId) : prev
                return [...withoutOld.filter((r) => r.id !== next.id), next]
              })
              setMonthlyMessage('Saved rent row.')
            }}
            onDelete={async (id) => {
              await deleteRentByCmaMonthly(id)
              setMonthlyRents((prev) => prev.filter((r) => r.id !== id))
              setMonthlyMessage('Deleted.')
            }}
          />
        </div>
      )}
    </section>
  )
}

function MonthlyRentsTable({
  rows,
  onChange,
  onDelete,
  wrapClassName = 'max-h-[min(55vh,480px)]',
}: {
  rows: RentByCmaMonthly[]
  onChange: (next: RentByCmaMonthly, oldId: string | null) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
  wrapClassName?: string
}) {
  return (
    <div className={`${wrapClassName} overflow-auto rounded-md border border-slate-200`}>
      <table className="min-w-full text-left text-xs">
        <thead className="sticky top-0 bg-slate-100 text-slate-700">
          <tr>
            <th className="px-2 py-2 font-semibold">ID</th>
            <th className="px-2 py-2 font-semibold">Month</th>
            <th className="px-2 py-2 font-semibold">Prov</th>
            <th className="px-2 py-2 font-semibold">CMA</th>
            <th className="px-2 py-2 font-semibold">Beds</th>
            <th className="px-2 py-2 font-semibold">Avg</th>
            <th className="px-2 py-2 font-semibold">Lat</th>
            <th className="px-2 py-2 font-semibold">Lng</th>
            <th className="px-2 py-2 font-semibold">Quality</th>
            <th className="px-2 py-2 font-semibold">Src date</th>
            <th className="px-2 py-2 font-semibold" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <RentRowEditor key={r.id} row={r} onChange={onChange} onDelete={onDelete} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RentRowEditor({
  row,
  onChange,
  onDelete,
}: {
  row: RentByCmaMonthly
  onChange: (next: RentByCmaMonthly, oldId: string | null) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
}) {
  const [draft, setDraft] = useState(row)
  useEffect(() => setDraft(row), [row])

  const nextId = makeRentMonthlyId(draft)
  const idChanged = nextId !== row.id

  const save = () => {
    void onChange(
      {
        ...draft,
        id: nextId,
      },
      idChanged ? row.id : null,
    )
  }

  return (
    <tr className="border-t border-slate-100">
      <td className="max-w-[10rem] truncate px-1 py-1 font-mono text-[10px] text-slate-500" title={row.id}>
        {row.id}
      </td>
      <td className="px-1 py-1">
        <input
          className="w-24 rounded border border-slate-300 px-1 py-0.5"
          value={draft.month}
          onChange={(e) => setDraft((d) => ({ ...d, month: e.target.value }))}
        />
      </td>
      <td className="px-1 py-1">
        <input
          className="w-10 rounded border border-slate-300 px-1 py-0.5"
          value={draft.province}
          onChange={(e) => setDraft((d) => ({ ...d, province: e.target.value }))}
        />
      </td>
      <td className="px-1 py-1">
        <input
          className="min-w-[6rem] rounded border border-slate-300 px-1 py-0.5"
          value={draft.cma}
          onChange={(e) => setDraft((d) => ({ ...d, cma: e.target.value }))}
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="number"
          className="w-12 rounded border border-slate-300 px-1 py-0.5"
          value={draft.bedrooms}
          onChange={(e) => setDraft((d) => ({ ...d, bedrooms: Number(e.target.value) || 0 }))}
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="number"
          className="w-16 rounded border border-slate-300 px-1 py-0.5"
          value={draft.avgRent}
          onChange={(e) => setDraft((d) => ({ ...d, avgRent: Math.max(0, Number(e.target.value) || 0) }))}
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="number"
          step="0.000001"
          className="w-24 rounded border border-slate-300 px-1 py-0.5"
          value={draft.lat ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, lat: e.target.value === '' ? undefined : Number(e.target.value) }))}
          placeholder="lat"
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="number"
          step="0.000001"
          className="w-24 rounded border border-slate-300 px-1 py-0.5"
          value={draft.lng ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, lng: e.target.value === '' ? undefined : Number(e.target.value) }))}
          placeholder="lng"
        />
      </td>
      <td className="px-1 py-1">
        <select
          className="rounded border border-slate-300 px-1 py-0.5"
          value={draft.quality}
          onChange={(e) => setDraft((d) => ({ ...d, quality: e.target.value as RentByCmaMonthly['quality'] }))}
        >
          <option value="verified">verified</option>
          <option value="carried-forward">carried-forward</option>
        </select>
      </td>
      <td className="px-1 py-1">
        <input
          className="w-[6.5rem] rounded border border-slate-300 px-1 py-0.5"
          value={draft.sourceDate}
          onChange={(e) => setDraft((d) => ({ ...d, sourceDate: e.target.value }))}
        />
      </td>
      <td className="whitespace-nowrap px-1 py-1">
        <button type="button" className="mr-2 text-blue-700 hover:underline" onClick={save}>
          Save
        </button>
        <button type="button" className="text-red-700 hover:underline" onClick={() => void onDelete(row.id)}>
          Delete
        </button>
      </td>
    </tr>
  )
}

function UtilitiesTable({
  rows,
  onChange,
  onDelete,
  wrapClassName = 'max-h-[min(55vh,480px)]',
}: {
  rows: UtilityPriceMonthly[]
  onChange: (next: UtilityPriceMonthly, oldId: string | null) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
  wrapClassName?: string
}) {
  return (
    <div className={`${wrapClassName} overflow-auto rounded-md border border-slate-200`}>
      <table className="min-w-full text-left text-xs">
        <thead className="sticky top-0 bg-slate-100 text-slate-700">
          <tr>
            <th className="px-2 py-2 font-semibold">ID</th>
            <th className="px-2 py-2 font-semibold">Month</th>
            <th className="px-2 py-2 font-semibold">Prov</th>
            <th className="px-2 py-2 font-semibold">City</th>
            <th className="px-2 py-2 font-semibold">Elec</th>
            <th className="px-2 py-2 font-semibold">Gas</th>
            <th className="px-2 py-2 font-semibold">Oil</th>
            <th className="px-2 py-2 font-semibold">Q</th>
            <th className="px-2 py-2 font-semibold">Src</th>
            <th className="px-2 py-2 font-semibold">Date</th>
            <th className="px-2 py-2 font-semibold" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <UtilityRowEditor key={r.id} row={r} onChange={onChange} onDelete={onDelete} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UtilityRowEditor({
  row,
  onChange,
  onDelete,
}: {
  row: UtilityPriceMonthly
  onChange: (next: UtilityPriceMonthly, oldId: string | null) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
}) {
  const [draft, setDraft] = useState(row)
  useEffect(() => setDraft(row), [row])

  const nextId = makeUtilityId(draft)
  const idChanged = nextId !== row.id

  const save = () => {
    void onChange({ ...draft, id: nextId }, idChanged ? row.id : null)
  }

  return (
    <tr className="border-t border-slate-100">
      <td className="max-w-[10rem] truncate px-1 py-1 font-mono text-[10px] text-slate-500" title={row.id}>
        {row.id}
      </td>
      <td className="px-1 py-1">
        <input
          className="w-24 rounded border border-slate-300 px-1 py-0.5"
          value={draft.month}
          onChange={(e) => setDraft((d) => ({ ...d, month: e.target.value }))}
        />
      </td>
      <td className="px-1 py-1">
        <input
          className="w-10 rounded border border-slate-300 px-1 py-0.5"
          value={draft.province}
          onChange={(e) => setDraft((d) => ({ ...d, province: e.target.value }))}
        />
      </td>
      <td className="px-1 py-1">
        <input
          className="min-w-[6rem] rounded border border-slate-300 px-1 py-0.5"
          value={draft.city}
          onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="number"
          step="0.01"
          className="w-14 rounded border border-slate-300 px-1 py-0.5"
          value={draft.electricity}
          onChange={(e) => setDraft((d) => ({ ...d, electricity: Number(e.target.value) || 0 }))}
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="number"
          step="0.01"
          className="w-14 rounded border border-slate-300 px-1 py-0.5"
          value={draft.naturalGas}
          onChange={(e) => setDraft((d) => ({ ...d, naturalGas: Number(e.target.value) || 0 }))}
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="number"
          step="0.01"
          className="w-14 rounded border border-slate-300 px-1 py-0.5"
          value={draft.oil}
          onChange={(e) => setDraft((d) => ({ ...d, oil: Number(e.target.value) || 0 }))}
        />
      </td>
      <td className="px-1 py-1">
        <select
          className="rounded border border-slate-300 px-1 py-0.5"
          value={draft.quality}
          onChange={(e) => setDraft((d) => ({ ...d, quality: e.target.value as UtilityPriceMonthly['quality'] }))}
        >
          <option value="verified">verified</option>
          <option value="carried-forward">carried-forward</option>
          <option value="estimated">estimated</option>
        </select>
      </td>
      <td className="max-w-[7rem] px-1 py-1">
        <input
          className="w-full rounded border border-slate-300 px-1 py-0.5 text-[10px]"
          value={draft.source}
          onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))}
        />
      </td>
      <td className="px-1 py-1">
        <input
          className="w-[6.5rem] rounded border border-slate-300 px-1 py-0.5"
          value={draft.sourceDate}
          onChange={(e) => setDraft((d) => ({ ...d, sourceDate: e.target.value }))}
        />
      </td>
      <td className="whitespace-nowrap px-1 py-1">
        <button type="button" className="mr-2 text-blue-700 hover:underline" onClick={save}>
          Save
        </button>
        <button type="button" className="text-red-700 hover:underline" onClick={() => void onDelete(row.id)}>
          Delete
        </button>
      </td>
    </tr>
  )
}
