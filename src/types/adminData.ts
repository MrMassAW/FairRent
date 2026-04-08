import type { CmhcRentRow } from '../data/cmhcRents'

export interface SourceReference {
  id: string
  name: string
  url: string
  cadence: 'weekly-check' | 'quarterly' | 'annual' | 'as-published'
  category: 'federal' | 'provincial' | 'methodology' | 'supplementary'
  notes: string
}

export interface RentDatasetSet {
  id: string
  name: string
  createdAt: string
  createdBy: 'seed' | 'admin-ai-agent'
  notes: string
  systemPrompt: string
  formulaDescription: string
  sources: SourceReference[]
  rents: CmhcRentRow[]
}

export type StatcanRentQuality = 'verified' | 'estimated'

export interface StatcanAskingRentQuarterly {
  /** Stable key: `${refDate}|${province}|${cma}|${bedrooms}`. */
  id: string
  /** StatCan REF_DATE, e.g. "2025Q4". */
  refDate: string
  /** Province code for the mapped CMA, e.g. "ON". */
  province: string
  /** CMA / urban centre label aligned to CMHC city strings where possible. */
  cma: string
  /** Bedroom count mapped to CMHC style (0=studio/bachelor, 1,2,3=3+). */
  bedrooms: number
  /** Asking rent (CAD/month). */
  askingRent: number
  /** Where the row came from (table ids). */
  source: 'STATCAN_46100092'
  sourceDate: string
  quality: StatcanRentQuality
  /** Optional StatCan “E” / flags, retained for auditing. */
  status?: string
}

export interface RentByCmaMonthly {
  id: string
  month: string
  province: string
  cma: string
  bedrooms: number
  avgRent: number
  /** Optional centroid coordinates for this CMA/city (used for geo fallback). */
  lat?: number
  lng?: number
  /** Rent values in the current pipeline come from CMHC RMS rows; `quality` marks survey-year match vs carried-forward. */
  source: 'CMHC'
  sourceDate: string
  quality: 'verified' | 'carried-forward'
}

export interface UtilityPriceMonthly {
  id: string
  month: string
  province: string
  city: string
  electricity: number
  naturalGas: number
  oil: number
  source: string
  sourceDate: string
  quality: 'verified' | 'carried-forward' | 'estimated'
}

export interface GeoDistanceReductionBandKm {
  /** Upper bound for this band (inclusive). Use `Infinity` for “catch-all”. */
  maxKm: number
  /** Multiplicative factor applied to market anchor (e.g. 0.9 = 10% reduction). */
  factor: number
}

/** Per-building-type multipliers for the renter market reference (IndexedDB; defaults from code catalog). */
export interface BuildingTypeFactorsPolicy {
  factors: Record<string, number>
  updatedAt: string
}

export interface GeoDistanceReductionPolicy {
  enabled: boolean
  /** Stepwise distance→factor policy, evaluated by ascending maxKm. */
  bandsKm: GeoDistanceReductionBandKm[]
  /** Minimum factor applied regardless of distance (prevents unrealistic reductions). */
  floorFactor: number
  /** Optional cap; if nearest CMA is farther than this, geo fallback is treated as unavailable. */
  maxSearchKm?: number
  updatedAt: string
}

export interface EntityDiffCounts {
  added: number
  removed: number
  modified: number
}

export interface RefreshDiffReport {
  isFirstRun: boolean
  previousRefreshedAt: string | null
  summary: {
    rentsByCma: EntityDiffCounts
  }
  /** Human-readable lines (added / removed / per-field changes). */
  lines: string[]
}

export interface WeeklyRefreshResult {
  refreshedAt: string
  checkedSources: string[]
  rentsByCmaWritten: number
  utilityPricesWritten: number
  cacheRefreshed: boolean
  notes: string[]
  logLines: string[]
  diff: RefreshDiffReport
}
