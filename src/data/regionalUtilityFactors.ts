/**
 * Relative energy-cost multipliers by province for scaling utility-related included options.
 *
 * Baseline: `monthlyDelta` values in HomePage are treated as a national / reference average
 * (multiplier 1.0). The admin refresh pipeline prefers **live Statistics Canada** ratios
 * (`statcanUtilityIngest.ts`) when CSV download succeeds; these seeded values are the
 * **fallback** when ingest fails or a geography is missing.
 *
 * All provinces default to 1.0 until seeded with source-based values — behavior matches
 * pre-regional pricing when every entry is 1.0.
 */
export type RegionalUtilityFactors = {
  electricity: number
  naturalGas: number
  oil: number
}

const DEFAULT_FACTORS: RegionalUtilityFactors = {
  electricity: 1,
  naturalGas: 1,
  oil: 1,
}

/**
 * Per-province factors (Canadian two-letter codes). Values are multipliers applied to the
 * baseline monthly add-on for the matching fuel type only.
 */
export const REGIONAL_UTILITY_FACTORS_BY_PROVINCE: Record<string, RegionalUtilityFactors> = {
  AB: { electricity: 0.92, naturalGas: 0.86, oil: 1.02 },
  BC: { electricity: 0.9, naturalGas: 1.16, oil: 1.08 },
  MB: { electricity: 0.89, naturalGas: 0.93, oil: 1.01 },
  NB: { electricity: 1.08, naturalGas: 1.1, oil: 1.2 },
  NL: { electricity: 0.84, naturalGas: 1.22, oil: 1.28 },
  NS: { electricity: 1.14, naturalGas: 1.12, oil: 1.22 },
  ON: { electricity: 1.03, naturalGas: 1.0, oil: 1.12 },
  PE: { electricity: 1.16, naturalGas: 1.15, oil: 1.24 },
  QC: { electricity: 0.76, naturalGas: 1.05, oil: 1.14 },
  SK: { electricity: 0.95, naturalGas: 0.9, oil: 1.06 },
}

const normalizeProvince = (province: string) => province.trim().toUpperCase()

export const getRegionalUtilityFactors = (province: string): RegionalUtilityFactors => {
  const key = normalizeProvince(province)
  return REGIONAL_UTILITY_FACTORS_BY_PROVINCE[key] ?? { ...DEFAULT_FACTORS }
}

/**
 * Maps amenity + selected option to which fuel index applies. Non-utility amenities return 1.
 */
export const getUtilityRegionalMultiplier = (
  amenityId: string,
  optionId: string,
  factors: RegionalUtilityFactors,
): number => {
  if (amenityId === 'electricity') {
    return factors.electricity
  }
  if (amenityId === 'naturalGas') {
    return factors.naturalGas
  }
  if (amenityId === 'heating') {
    if (optionId === 'electric') return factors.electricity
    if (optionId === 'gas') return factors.naturalGas
    if (optionId === 'oil') return factors.oil
  }
  return 1
}
