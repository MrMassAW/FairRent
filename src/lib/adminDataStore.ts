import { fallbackCmhcRents } from '../data/cmhcRents'
import type {
  BuildingTypeFactorsPolicy,
  EntityDiffCounts,
  GeoDistanceReductionPolicy,
  RefreshDiffReport,
  RentByCmaMonthly,
  RentDatasetSet,
  StatcanAskingRentQuarterly,
  UtilityPriceMonthly,
  WeeklyRefreshResult,
} from '../types/adminData'
import { mergeDefaultBuildingTypeFactors } from './buildingTypes'
import { UTILITY_GEOGRAPHY_POLICY } from './utilityGeographyPolicy'
import { fetchStatcanUtilitySnapshot } from './statcanUtilityIngest'
import { fetchOebBillDataXml, parseOebBillDataXml, summarizeOebOntarioResidentialElectricity } from './utilityIngest/oebBillData'
import { buildUtilityPriceMonthlyRows, type OebElectricityContext } from './utilityIngest/mergeUtilityPriceRows'
import { DEFAULT_SOURCES, getAllVerificationUrls } from './sourcesRegistry'

const DB_NAME = 'fairrent-admin-db'
const DB_VERSION = 5
const DATASET_STORE = 'datasetSets'
const SETTINGS_STORE = 'settings'
const RENTS_BY_CMA_STORE = 'rents_by_cma'
const UTILITY_PRICES_STORE = 'utility_prices'
const STATCAN_ASKING_RENTS_STORE = 'statcan_asking_rents'
const ACTIVE_DATASET_KEY = 'activeDatasetId'
const LAST_REFRESH_KEY = 'lastRefreshAt'
const GEO_DISTANCE_REDUCTION_POLICY_KEY = 'geoDistanceReductionPolicy'
const BUILDING_TYPE_FACTORS_POLICY_KEY = 'buildingTypeFactorsPolicy'

const defaultBuildingTypeFactorsPolicy = (): BuildingTypeFactorsPolicy => ({
  factors: mergeDefaultBuildingTypeFactors(),
  updatedAt: new Date().toISOString(),
})

const defaultGeoDistanceReductionPolicy = (): GeoDistanceReductionPolicy => ({
  enabled: false,
  // Conservative defaults; intended to be customized in Admin.
  bandsKm: [
    { maxKm: 10, factor: 1 },
    { maxKm: 25, factor: 0.97 },
    { maxKm: 50, factor: 0.94 },
    { maxKm: 100, factor: 0.9 },
    { maxKm: Infinity, factor: 0.85 },
  ],
  floorFactor: 0.75,
  maxSearchKm: 250,
  updatedAt: new Date().toISOString(),
})

const SYSTEM_PROMPT = `You are the FairRent admin data operations agent.
Your task is to update the calculator dataset for Canada using only approved official sources.
Never invent sources, values, or formulas.
For each update run (data pipeline — not the same as the shipped browser formula):
1) Review Statistics Canada housing and rent publications for context and any series you are asked to align.
2) Use CMHC Rental Market Survey data tables as the primary anchor for average rent by CMA/bedroom in this app.
3) Build a validated dataset keyed by province + city/CMA + bedrooms.
4) Produce an auditable output including source URLs, verification date, and notes.
If data is missing for an area, keep the previous known value and mark it as carried forward.`

const FORMULA_DESCRIPTION = `Shipped open-source UI (Home): renter path uses CMHC-style average rent lookup plus optional amenity deltas; landlord path uses calculateRent (costs + vacancy + maintenance + return). Renter scale bands 0.9 and 1.15 are app heuristics, not statutory caps (see Methodology).
Refresh targets: StatCan and CMHC publications — then update the active dataset per sourcesRegistry.`

const defaultDataset = (): RentDatasetSet => ({
  id: 'seed-2026-03-23',
  name: 'Seed baseline (March 2026)',
  createdAt: new Date().toISOString(),
  createdBy: 'seed',
  notes: 'Initial bundled data from FairRent baseline plus source registry.',
  systemPrompt: SYSTEM_PROMPT,
  formulaDescription: FORMULA_DESCRIPTION,
  sources: DEFAULT_SOURCES,
  rents: fallbackCmhcRents,
})

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DATASET_STORE)) {
        db.createObjectStore(DATASET_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE)
      }
      if (!db.objectStoreNames.contains(RENTS_BY_CMA_STORE)) {
        db.createObjectStore(RENTS_BY_CMA_STORE, { keyPath: 'id' })
      }
      if (db.objectStoreNames.contains('guidelines')) {
        db.deleteObjectStore('guidelines')
      }
      if (!db.objectStoreNames.contains(UTILITY_PRICES_STORE)) {
        db.createObjectStore(UTILITY_PRICES_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STATCAN_ASKING_RENTS_STORE)) {
        db.createObjectStore(STATCAN_ASKING_RENTS_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const txRequest = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const waitTransaction = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })

export const ensureAdminDataSeeded = async (): Promise<void> => {
  const db = await openDb()
  const countTx = db.transaction(DATASET_STORE, 'readonly')
  const countReq = countTx.objectStore(DATASET_STORE).count()
  const count = await txRequest(countReq)
  if (count === 0) {
    const seed = defaultDataset()
    const writeTx = db.transaction([DATASET_STORE, SETTINGS_STORE], 'readwrite')
    writeTx.objectStore(DATASET_STORE).put(seed)
    writeTx.objectStore(SETTINGS_STORE).put(seed.id, ACTIVE_DATASET_KEY)
    await waitTransaction(writeTx)
  }
  db.close()
}

/**
 * Deletes the entire local admin IndexedDB database so the app can start fresh.
 * Next read will recreate seed rows via `ensureAdminDataSeeded()`.
 */
export const resetAdminDatabase = async (): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = window.indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('IndexedDB delete failed'))
    request.onblocked = () =>
      reject(new Error('Database reset blocked. Close other FairRent tabs and retry.'))
  })

export const upsertStatcanAskingRentQuarterly = async (row: StatcanAskingRentQuarterly): Promise<void> => {
  const db = await openDb()
  const tx = db.transaction(STATCAN_ASKING_RENTS_STORE, 'readwrite')
  tx.objectStore(STATCAN_ASKING_RENTS_STORE).put(row)
  await waitTransaction(tx)
  db.close()
}

export const bulkUpsertStatcanAskingRentQuarterly = async (rows: StatcanAskingRentQuarterly[]): Promise<void> => {
  const db = await openDb()
  const tx = db.transaction(STATCAN_ASKING_RENTS_STORE, 'readwrite')
  const store = tx.objectStore(STATCAN_ASKING_RENTS_STORE)
  rows.forEach((r) => store.put(r))
  await waitTransaction(tx)
  db.close()
}

export const readAllStatcanAskingRentsQuarterly = async (): Promise<StatcanAskingRentQuarterly[]> => {
  const db = await openDb()
  const tx = db.transaction(STATCAN_ASKING_RENTS_STORE, 'readonly')
  const rows = (await txRequest(tx.objectStore(STATCAN_ASKING_RENTS_STORE).getAll())) as StatcanAskingRentQuarterly[]
  db.close()
  return rows
}

export const clearStatcanAskingRentsQuarterly = async (): Promise<void> => {
  const db = await openDb()
  const tx = db.transaction(STATCAN_ASKING_RENTS_STORE, 'readwrite')
  tx.objectStore(STATCAN_ASKING_RENTS_STORE).clear()
  await waitTransaction(tx)
  db.close()
}

export const bulkDeleteStatcanAskingRentsQuarterly = async (ids: string[]): Promise<void> => {
  if (ids.length === 0) return
  const db = await openDb()
  const tx = db.transaction(STATCAN_ASKING_RENTS_STORE, 'readwrite')
  const store = tx.objectStore(STATCAN_ASKING_RENTS_STORE)
  ids.forEach((id) => store.delete(id))
  await waitTransaction(tx)
  db.close()
}

const readAllDatasets = async (): Promise<RentDatasetSet[]> => {
  const db = await openDb()
  const tx = db.transaction(DATASET_STORE, 'readonly')
  const rows = (await txRequest(tx.objectStore(DATASET_STORE).getAll())) as RentDatasetSet[]
  db.close()
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export const getAllDatasets = async (): Promise<RentDatasetSet[]> => {
  await ensureAdminDataSeeded()
  return readAllDatasets()
}

export const getActiveDatasetId = async (): Promise<string | null> => {
  await ensureAdminDataSeeded()
  const db = await openDb()
  const tx = db.transaction(SETTINGS_STORE, 'readonly')
  const active = (await txRequest(tx.objectStore(SETTINGS_STORE).get(ACTIVE_DATASET_KEY))) as string | undefined
  db.close()
  return active ?? null
}

export const setActiveDatasetId = async (datasetId: string): Promise<void> => {
  const db = await openDb()
  const tx = db.transaction(SETTINGS_STORE, 'readwrite')
  tx.objectStore(SETTINGS_STORE).put(datasetId, ACTIVE_DATASET_KEY)
  await waitTransaction(tx)
  db.close()
}

export const getGeoDistanceReductionPolicy = async (): Promise<GeoDistanceReductionPolicy> => {
  await ensureAdminDataSeeded()
  const db = await openDb()
  const tx = db.transaction(SETTINGS_STORE, 'readonly')
  const value = (await txRequest(tx.objectStore(SETTINGS_STORE).get(GEO_DISTANCE_REDUCTION_POLICY_KEY))) as
    | GeoDistanceReductionPolicy
    | undefined
  db.close()
  if (!value) return defaultGeoDistanceReductionPolicy()
  // Guard against partial/older shapes.
  return {
    ...defaultGeoDistanceReductionPolicy(),
    ...value,
    bandsKm: Array.isArray(value.bandsKm) && value.bandsKm.length > 0 ? value.bandsKm : defaultGeoDistanceReductionPolicy().bandsKm,
    updatedAt: value.updatedAt ?? new Date().toISOString(),
  }
}

export const setGeoDistanceReductionPolicy = async (policy: GeoDistanceReductionPolicy): Promise<void> => {
  const db = await openDb()
  const tx = db.transaction(SETTINGS_STORE, 'readwrite')
  tx
    .objectStore(SETTINGS_STORE)
    .put({ ...policy, updatedAt: new Date().toISOString() } satisfies GeoDistanceReductionPolicy, GEO_DISTANCE_REDUCTION_POLICY_KEY)
  await waitTransaction(tx)
  db.close()
}

export const getBuildingTypeFactorsPolicy = async (): Promise<BuildingTypeFactorsPolicy> => {
  await ensureAdminDataSeeded()
  const defaults = defaultBuildingTypeFactorsPolicy()
  const db = await openDb()
  const tx = db.transaction(SETTINGS_STORE, 'readonly')
  const value = (await txRequest(tx.objectStore(SETTINGS_STORE).get(BUILDING_TYPE_FACTORS_POLICY_KEY))) as
    | BuildingTypeFactorsPolicy
    | undefined
  db.close()
  if (!value || typeof value.factors !== 'object' || value.factors === null) {
    return defaults
  }
  return {
    factors: { ...defaults.factors, ...value.factors },
    updatedAt: value.updatedAt ?? defaults.updatedAt,
  }
}

export const setBuildingTypeFactorsPolicy = async (policy: BuildingTypeFactorsPolicy): Promise<void> => {
  const db = await openDb()
  const tx = db.transaction(SETTINGS_STORE, 'readwrite')
  tx
    .objectStore(SETTINGS_STORE)
    .put({ ...policy, updatedAt: new Date().toISOString() } satisfies BuildingTypeFactorsPolicy, BUILDING_TYPE_FACTORS_POLICY_KEY)
  await waitTransaction(tx)
  db.close()
}

export const getActiveDataset = async (): Promise<RentDatasetSet | null> => {
  await ensureAdminDataSeeded()
  const [datasets, activeId] = await Promise.all([getAllDatasets(), getActiveDatasetId()])
  if (!activeId) {
    return datasets[0] ?? null
  }
  return datasets.find((row) => row.id === activeId) ?? datasets[0] ?? null
}

export const saveDataset = async (dataset: RentDatasetSet): Promise<void> => {
  const db = await openDb()
  const tx = db.transaction(DATASET_STORE, 'readwrite')
  tx.objectStore(DATASET_STORE).put(dataset)
  await waitTransaction(tx)
  db.close()
}

export const writeMonthlyHistory = async (entries: {
  rentsByCma: RentByCmaMonthly[]
  utilityPrices: UtilityPriceMonthly[]
  refreshedAt: string
}): Promise<void> => {
  const db = await openDb()
  const tx = db.transaction([RENTS_BY_CMA_STORE, UTILITY_PRICES_STORE, SETTINGS_STORE], 'readwrite')
  const rentStore = tx.objectStore(RENTS_BY_CMA_STORE)
  const utilityStore = tx.objectStore(UTILITY_PRICES_STORE)
  rentStore.clear()
  utilityStore.clear()
  entries.rentsByCma.forEach((row) => rentStore.put(row))
  entries.utilityPrices.forEach((row) => utilityStore.put(row))
  tx.objectStore(SETTINGS_STORE).put(entries.refreshedAt, LAST_REFRESH_KEY)
  await waitTransaction(tx)
  db.close()
}

export const upsertRentByCmaMonthly = async (row: RentByCmaMonthly): Promise<void> => {
  const db = await openDb()
  const tx = db.transaction(RENTS_BY_CMA_STORE, 'readwrite')
  tx.objectStore(RENTS_BY_CMA_STORE).put(row)
  await waitTransaction(tx)
  db.close()
}

export const deleteRentByCmaMonthly = async (id: string): Promise<void> => {
  const db = await openDb()
  const tx = db.transaction(RENTS_BY_CMA_STORE, 'readwrite')
  tx.objectStore(RENTS_BY_CMA_STORE).delete(id)
  await waitTransaction(tx)
  db.close()
}

export const upsertUtilityPriceMonthly = async (row: UtilityPriceMonthly): Promise<void> => {
  const db = await openDb()
  const tx = db.transaction(UTILITY_PRICES_STORE, 'readwrite')
  tx.objectStore(UTILITY_PRICES_STORE).put(row)
  await waitTransaction(tx)
  db.close()
}

export const deleteUtilityPriceMonthly = async (id: string): Promise<void> => {
  const db = await openDb()
  const tx = db.transaction(UTILITY_PRICES_STORE, 'readwrite')
  tx.objectStore(UTILITY_PRICES_STORE).delete(id)
  await waitTransaction(tx)
  db.close()
}

/** Rebuilds 24-month rent and utility rows from the active dataset (replaces monthly stores). */
export const rebuildMonthlyFromActiveDataset = async (): Promise<string> => {
  await ensureAdminDataSeeded()
  const history = await buildTwoYearMonthlyHistory()
  const refreshedAt = new Date().toISOString()
  await writeMonthlyHistory({ ...history, refreshedAt })
  return refreshedAt
}

export const getLastRefreshAt = async (): Promise<string | null> => {
  await ensureAdminDataSeeded()
  const db = await openDb()
  const tx = db.transaction(SETTINGS_STORE, 'readonly')
  const value = (await txRequest(tx.objectStore(SETTINGS_STORE).get(LAST_REFRESH_KEY))) as string | undefined
  db.close()
  return value ?? null
}

export const readFullMonthlyHistory = async (): Promise<{
  rentsByCma: RentByCmaMonthly[]
  utilityPrices: UtilityPriceMonthly[]
}> => {
  await ensureAdminDataSeeded()
  const db = await openDb()
  const tx = db.transaction([RENTS_BY_CMA_STORE, UTILITY_PRICES_STORE], 'readonly')
  const rentsByCma = (await txRequest(tx.objectStore(RENTS_BY_CMA_STORE).getAll())) as RentByCmaMonthly[]
  const utilityPrices = (await txRequest(tx.objectStore(UTILITY_PRICES_STORE).getAll())) as UtilityPriceMonthly[]
  await waitTransaction(tx)
  db.close()
  return { rentsByCma, utilityPrices }
}

const RENT_DIFF_KEYS: (keyof RentByCmaMonthly)[] = [
  'month',
  'province',
  'cma',
  'bedrooms',
  'avgRent',
  'source',
  'sourceDate',
  'quality',
]

const fieldChanges = <T extends object>(
  a: T,
  b: T,
  keys: (keyof T)[],
): { field: string; before: string; after: string }[] => {
  const out: { field: string; before: string; after: string }[] = []
  for (const k of keys) {
    const va = a[k as keyof T]
    const vb = b[k as keyof T]
    const sa = va === undefined || va === null ? '' : String(va)
    const sb = vb === undefined || vb === null ? '' : String(vb)
    if (sa !== sb) {
      out.push({ field: String(k), before: sa, after: sb })
    }
  }
  return out
}

const buildRefreshDiffReport = (
  previous: { rentsByCma: RentByCmaMonthly[] },
  next: { rentsByCma: RentByCmaMonthly[] },
  previousRefreshedAt: string | null,
): RefreshDiffReport => {
  const lines: string[] = []
  const rentPrev = new Map(previous.rentsByCma.map((r) => [r.id, r]))
  const rentNext = new Map(next.rentsByCma.map((r) => [r.id, r]))

  const rentCounts: EntityDiffCounts = { added: 0, removed: 0, modified: 0 }

  const isFirstRun = rentPrev.size === 0

  lines.push('--- Diff vs previous calculator DB snapshot ---')
  if (isFirstRun) {
    lines.push('(No prior monthly history in IndexedDB — treating all rows as new.)')
  } else if (previousRefreshedAt) {
    lines.push(`Previous refresh timestamp: ${previousRefreshedAt}`)
  }

  for (const id of rentNext.keys()) {
    if (!rentPrev.has(id)) {
      rentCounts.added += 1
      lines.push(`+ rent [${id}]`)
    }
  }
  for (const id of rentPrev.keys()) {
    if (!rentNext.has(id)) {
      rentCounts.removed += 1
      lines.push(`- rent [${id}]`)
    }
  }
  for (const [id, newRow] of rentNext) {
    const oldRow = rentPrev.get(id)
    if (!oldRow) continue
    const changes = fieldChanges(oldRow, newRow, RENT_DIFF_KEYS)
    if (changes.length > 0) {
      rentCounts.modified += 1
      lines.push(`~ rent [${id}]`)
      for (const c of changes) {
        lines.push(`    ${c.field}: ${c.before} → ${c.after}`)
      }
    }
  }

  if (
    rentCounts.added === 0 &&
    rentCounts.removed === 0 &&
    rentCounts.modified === 0
  ) {
    lines.push('No row-level changes detected (new snapshot matches previous).')
  }

  lines.push(`Summary — rents: +${rentCounts.added} -${rentCounts.removed} ~${rentCounts.modified}`)

  return {
    isFirstRun,
    previousRefreshedAt,
    summary: { rentsByCma: rentCounts },
    lines,
  }
}

const makeMonthKey = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`

const pastMonths = (months: number): string[] => {
  const values: string[] = []
  const now = new Date()
  const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  for (let i = 0; i < months; i += 1) {
    const date = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1))
    values.push(makeMonthKey(date))
  }
  return values.reverse()
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Minimum time each phase stays in "running" so the UI can show animated dots. */
const MIN_PHASE_MS = 650

export type CategoryFetchPhaseEvent =
  | { kind: 'phase'; id: string; label: string; state: 'start' }
  | { kind: 'phase'; id: string; state: 'end'; ok: boolean }

export type BuildHistoryLogOptions = {
  /** One row per source in the admin UI (animated dots → Success / Failure). When set, text log lines are omitted during the build. */
  onPhase?: (event: CategoryFetchPhaseEvent) => void
}

export const buildTwoYearMonthlyHistory = async (
  log?: (message: string) => void,
  options?: BuildHistoryLogOptions,
): Promise<{
  rentsByCma: RentByCmaMonthly[]
  utilityPrices: UtilityPriceMonthly[]
}> => {
  const L = log ?? (() => {})
  const onPhase = options?.onPhase

  const endPhaseAfterMin = async (id: string, ok: boolean, startedAt: number) => {
    const dt = Date.now() - startedAt
    if (dt < MIN_PHASE_MS) await sleep(MIN_PHASE_MS - dt)
    onPhase?.({ kind: 'phase', id, state: 'end', ok })
  }

  let t0 = Date.now()
  if (onPhase) {
    onPhase({
      kind: 'phase',
      id: 'active-dataset',
      label: 'Active CMHC dataset (IndexedDB)',
      state: 'start',
    })
  } else {
    L('Resolving active dataset from IndexedDB…')
  }

  const active = await getActiveDataset()
  if (onPhase) {
    await endPhaseAfterMin('active-dataset', active !== null, t0)
  }

  if (!active) {
    if (!onPhase) L('No active dataset found — skipping history build.')
    return { rentsByCma: [], utilityPrices: [] }
  }

  if (!onPhase) {
    L(`Active dataset: "${active.name}" (${active.id}), ${active.rents.length} CMHC rent rows.`)
  }

  const months = pastMonths(24)
  if (!onPhase) {
    L(`Month window (24 rolling, UTC): ${months[0]} … ${months[months.length - 1]} (${months.length} months).`)
    L(
      `Utility geography policy: oil=${UTILITY_GEOGRAPHY_POLICY.oil}, gas=${UTILITY_GEOGRAPHY_POLICY.naturalGas}, electricity=${UTILITY_GEOGRAPHY_POLICY.electricity}.`,
    )
  }

  t0 = Date.now()
  if (onPhase) {
    onPhase({
      kind: 'phase',
      id: 'statcan-csv',
      label: 'Statistics Canada — WDS CSV (18100001, 25100059, 18100204)',
      state: 'start',
    })
  }
  const statcan = await fetchStatcanUtilitySnapshot(months)
  if (onPhase) {
    await endPhaseAfterMin('statcan-csv', statcan.ok, t0)
  } else if (statcan.ok) {
    L('StatCan utility CSV ingest succeeded (WDS → zip → CSV for tables 18100001, 25100059, 18100204).')
  } else {
    L(`StatCan utility ingest skipped: ${statcan.error} (using seeded regional factors; OEB may fill ON electricity).`)
  }

  let oebContext: OebElectricityContext = null
  t0 = Date.now()
  if (onPhase) {
    onPhase({
      kind: 'phase',
      id: 'oeb-xml',
      label: 'Ontario Energy Board — BillData.xml',
      state: 'start',
    })
  }
  let oebOk = false
  try {
    const xml = await fetchOebBillDataXml()
    const oebRows = parseOebBillDataXml(xml)
    const summary = summarizeOebOntarioResidentialElectricity(oebRows)
    if (summary) {
      oebContext = { summary, rows: oebRows }
      oebOk = true
      if (!onPhase) {
        L(`OEB BillData.xml: ${summary.count} Ontario residential electricity distributor rows (mean Net $/kWh).`)
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    oebOk = false
    if (!onPhase) L(`OEB BillData.xml ingest skipped: ${msg}`)
  }
  if (onPhase) {
    await endPhaseAfterMin('oeb-xml', oebOk, t0)
  }

  const latestYear = Math.max(...active.rents.map((row) => row.surveyYear))
  const latestSurveyRows = active.rents.filter((row) => row.surveyYear === latestYear)
  if (!onPhase) {
    L(`Latest survey year in dataset: ${latestYear} (${latestSurveyRows.length} CMA/bedroom rows).`)
  }

  t0 = Date.now()
  if (onPhase) {
    onPhase({
      kind: 'phase',
      id: 'build-rents',
      label: 'Build — monthly rent rows (CMHC × 24 months)',
      state: 'start',
    })
  }

  const rentsByCma: RentByCmaMonthly[] = months.flatMap((month) => {
    const year = Number(month.slice(0, 4))
    return latestSurveyRows.map((row) => {
      const quality = year === latestYear ? 'verified' : 'carried-forward'
      // Values always come from CMHC RMS rows in the active dataset; older calendar months reuse latest survey (carried-forward).
      const source = 'CMHC' as const
      return {
        id: `${month}|${row.province}|${row.city}|${row.bedrooms}`,
        month,
        province: row.province,
        cma: row.city,
        bedrooms: row.bedrooms,
        avgRent: row.avgRent,
        source,
        sourceDate: `${row.surveyYear}-12-31`,
        quality,
      } satisfies RentByCmaMonthly
    })
  })

  if (onPhase) {
    await endPhaseAfterMin('build-rents', true, t0)
  }

  t0 = Date.now()
  if (onPhase) {
    onPhase({
      kind: 'phase',
      id: 'build-utilities',
      label: 'Build — utility multiplier rows',
      state: 'start',
    })
  }

  const utilityPrices: UtilityPriceMonthly[] = buildUtilityPriceMonthlyRows({
    months,
    latestSurveyRows,
    statcan,
    oeb: oebContext,
  })

  if (onPhase) {
    await endPhaseAfterMin('build-utilities', true, t0)
  }

  if (!onPhase) {
    L(
      `Generated ${rentsByCma.length} monthly rent rows and ${utilityPrices.length} utility factor rows.`,
    )
  }

  return { rentsByCma, utilityPrices }
}

export type AdminMonthlyFetchCategory = 'monthly-rents' | 'utilities'

/**
 * Rebuild one slice of the 24-month history (rents or utilities) and merge with existing stores.
 * Runs the full `buildTwoYearMonthlyHistory` pipeline once, then replaces only the selected category in IndexedDB.
 */
export const runCategoryMonthlyFetch = async (
  category: AdminMonthlyFetchCategory,
  options?: {
    onLog?: (line: string) => void
    onPhase?: (event: CategoryFetchPhaseEvent) => void
  },
): Promise<{ ok: boolean; logLines: string[]; error?: string }> => {
  const logLines: string[] = []
  const log = (message: string) => {
    const line = `[${new Date().toISOString().slice(11, 19)}] ${message}`
    logLines.push(line)
    options?.onLog?.(line)
  }

  const onPhase = options?.onPhase

  const endPhaseAfterMin = async (id: string, ok: boolean, startedAt: number) => {
    const dt = Date.now() - startedAt
    if (dt < MIN_PHASE_MS) await sleep(MIN_PHASE_MS - dt)
    onPhase?.({ kind: 'phase', id, state: 'end', ok })
  }

  try {
    await ensureAdminDataSeeded()
    log(`Category fetch started — ${category}`)
    const previous = await readFullMonthlyHistory()
    log(
      `IndexedDB before — rents: ${previous.rentsByCma.length}, utilities: ${previous.utilityPrices.length}`,
    )

    const built = await buildTwoYearMonthlyHistory(undefined, { onPhase })

    let t0 = Date.now()
    if (onPhase) {
      onPhase({
        kind: 'phase',
        id: 'merge-store',
        label: 'Merge snapshot (keep other categories unchanged)',
        state: 'start',
      })
    }
    const merged = {
      rentsByCma: category === 'monthly-rents' ? built.rentsByCma : previous.rentsByCma,
      utilityPrices: category === 'utilities' ? built.utilityPrices : previous.utilityPrices,
    }
    if (onPhase) {
      await endPhaseAfterMin('merge-store', true, t0)
    }

    t0 = Date.now()
    if (onPhase) {
      onPhase({
        kind: 'phase',
        id: 'write-idb',
        label: 'Persist IndexedDB (monthly stores)',
        state: 'start',
      })
    }
    const refreshedAt = new Date().toISOString()
    await writeMonthlyHistory({ ...merged, refreshedAt })
    if (onPhase) {
      await endPhaseAfterMin('write-idb', true, t0)
    }

    log(
      `Done — ${category}: wrote ${merged.rentsByCma.length} rent / ${merged.utilityPrices.length} utility rows; refreshed_at=${refreshedAt}`,
    )
    return { ok: true, logLines }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log(`FAIL — ${msg}`)
    return { ok: false, logLines, error: msg }
  }
}

export const runWeeklyRefresh = async (options?: { onLog?: (line: string) => void }): Promise<WeeklyRefreshResult> => {
  const logLines: string[] = []
  const log = (message: string) => {
    const line = `[${new Date().toISOString().slice(11, 19)}] ${message}`
    logLines.push(line)
    options?.onLog?.(line)
  }

  log('Starting weekly / manual refresh pipeline (local calculator DB).')
  log('Step 1/5: Ensure admin dataset seed exists in IndexedDB…')
  await ensureAdminDataSeeded()
  log('Step 1 complete: fairrent-admin-db ready.')

  log('Step 2/5: Read previous monthly history snapshot (for diff)…')
  const previousRefreshedAt = await getLastRefreshAt()
  const previousSnapshot = await readFullMonthlyHistory()
  log(
    `Previous snapshot: ${previousSnapshot.rentsByCma.length} rent rows, ${previousSnapshot.utilityPrices.length} utility rows; last_refresh_at=${previousRefreshedAt ?? 'never'}.`,
  )

  const checkedSources = getAllVerificationUrls()

  log('Step 3/5: Source registry check (pipeline targets — verify upstream on schedule):')
  checkedSources.forEach((url, i) => log(`  ${i + 1}. ${url}`))

  log('Step 4/5: Build 24-month rolling history from active dataset…')
  const history = await buildTwoYearMonthlyHistory((msg) => log(`  ${msg}`))
  log(
    `Step 4 complete: prepared ${history.rentsByCma.length} rent rows, ${history.utilityPrices.length} utility rows.`,
  )

  const diff = buildRefreshDiffReport(previousSnapshot, history, previousRefreshedAt)
  log('Step 5/5: Persist to IndexedDB (rents_by_cma, utility_prices, last_refresh_at)…')
  const refreshedAt = new Date().toISOString()
  await writeMonthlyHistory({ ...history, refreshedAt })
  log(`Step 5 complete: wrote refreshed_at=${refreshedAt}.`)

  diff.lines.forEach((l) => log(l))

  log('Refresh finished successfully.')

  return {
    refreshedAt,
    checkedSources,
    rentsByCmaWritten: history.rentsByCma.length,
    utilityPricesWritten: history.utilityPrices.length,
    cacheRefreshed: true,
    notes: [
      'Backfilled 24 monthly periods using latest verified official values.',
      'Older months are marked as carried-forward until newer official releases are ingested.',
      'Utility multipliers use Statistics Canada CSV (WDS) when available; OEB BillData.xml can backfill Ontario electricity if StatCan fails; otherwise seeded regional factors.',
    ],
    logLines,
    diff,
  }
}

export const getAvailableHistoryMonths = async (): Promise<string[]> => {
  await ensureAdminDataSeeded()
  const db = await openDb()
  const tx = db.transaction(RENTS_BY_CMA_STORE, 'readonly')
  const rows = (await txRequest(tx.objectStore(RENTS_BY_CMA_STORE).getAll())) as RentByCmaMonthly[]
  db.close()
  const months = Array.from(new Set(rows.map((row) => row.month)))
  return months.sort((a, b) => b.localeCompare(a))
}

export const getRentsForMonth = async (month: string): Promise<RentByCmaMonthly[]> => {
  await ensureAdminDataSeeded()
  const db = await openDb()
  const tx = db.transaction(RENTS_BY_CMA_STORE, 'readonly')
  const rows = (await txRequest(tx.objectStore(RENTS_BY_CMA_STORE).getAll())) as RentByCmaMonthly[]
  db.close()
  return rows.filter((row) => row.month === month)
}

export const getUtilityPricesForMonth = async (month: string): Promise<UtilityPriceMonthly[]> => {
  await ensureAdminDataSeeded()
  const db = await openDb()
  const tx = db.transaction(UTILITY_PRICES_STORE, 'readonly')
  const rows = (await txRequest(tx.objectStore(UTILITY_PRICES_STORE).getAll())) as UtilityPriceMonthly[]
  db.close()
  return rows.filter((row) => row.month === month)
}

/** Latest utility multiplier row for a CMHC city (by month descending). Used by the public calculator when IDB has been refreshed. */
export const getLatestUtilityRowForCma = async (
  province: string,
  city: string,
): Promise<UtilityPriceMonthly | null> => {
  await ensureAdminDataSeeded()
  const db = await openDb()
  const tx = db.transaction(UTILITY_PRICES_STORE, 'readonly')
  const rows = (await txRequest(tx.objectStore(UTILITY_PRICES_STORE).getAll())) as UtilityPriceMonthly[]
  db.close()
  const p = province.trim().toUpperCase()
  const c = city.trim()
  const match = rows.filter((row) => row.province.toUpperCase() === p && row.city === c)
  if (match.length === 0) return null
  match.sort((a, b) => b.month.localeCompare(a.month))
  return match[0] ?? null
}
