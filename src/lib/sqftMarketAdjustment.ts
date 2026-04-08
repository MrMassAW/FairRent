/**
 * CMHC average rents are by structure/bedrooms/CMA — not floor area. When the user enters
 * square footage, we scale the benchmark by a bounded percentage derived from size vs a
 * typical apartment size for that bedroom count.
 */

/** Typical interior size (sq ft) by bedroom count — benchmarks only, not from CMHC. */
const TYPICAL_SQFT_BY_BEDROOMS: Record<number, number> = {
  0: 450,
  1: 650,
  2: 900,
  3: 1100,
  4: 1250,
  5: 1400,
}

/**
 * Share of relative size (vs typical) passed through to rent. Keeping elasticity below 1 avoids
 * implying rent scales 1:1 with square footage.
 */
export const SQFT_RENT_ELASTICITY = 0.35

/** Cap on the rent change from sqft alone (±), so extreme inputs do not dominate. */
const SQFT_ADJUSTMENT_FRACTION_CAP = 0.35

export const getTypicalSqftForBedrooms = (bedrooms: number): number => {
  const b = Math.max(0, Math.min(5, Math.round(bedrooms)))
  return TYPICAL_SQFT_BY_BEDROOMS[b] ?? TYPICAL_SQFT_BY_BEDROOMS[1]
}

export interface SqftMarketAdjustment {
  adjustedRent: number
  rawCmhcRent: number
  typicalSqft: number
  /** Fractional change applied to CMHC average, e.g. 0.024 = +2.4% */
  rentDeltaFraction: number
}

/**
 * Returns null when sqft should not adjust the benchmark (missing, invalid, or no CMHC row).
 */
export const applySquareFootageToMarketRent = (
  cmhcAverageRent: number,
  bedrooms: number,
  squareFeet: number | undefined,
): SqftMarketAdjustment | null => {
  if (!Number.isFinite(cmhcAverageRent) || cmhcAverageRent <= 0) return null
  if (squareFeet === undefined || squareFeet <= 0) return null

  const typicalSqft = getTypicalSqftForBedrooms(bedrooms)
  if (typicalSqft <= 0) return null

  const relativeSize = squareFeet / typicalSqft
  let rentDeltaFraction = (relativeSize - 1) * SQFT_RENT_ELASTICITY
  rentDeltaFraction = Math.max(
    -SQFT_ADJUSTMENT_FRACTION_CAP,
    Math.min(SQFT_ADJUSTMENT_FRACTION_CAP, rentDeltaFraction),
  )

  return {
    adjustedRent: cmhcAverageRent * (1 + rentDeltaFraction),
    rawCmhcRent: cmhcAverageRent,
    typicalSqft,
    rentDeltaFraction,
  }
}
