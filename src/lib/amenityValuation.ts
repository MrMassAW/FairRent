import type { AmenityModifierInput } from '../types/calculator'

export const AMENITY_VALUATION_DEFAULTS = {
  additionalQuantityFactor: 0.85,
  sharedGarageFactor: 0.7,
  storageSqftTiers: [
    { upto: 100, rate: 0.75 },
    { upto: 300, rate: 0.5 },
    { upto: Infinity, rate: 0.3 },
  ],
} as const

const clampPositive = (value: number | undefined, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, value)
}

const roundToHalf = (value: number): number => Math.round(value * 2) / 2

const computeQuantityMultiplier = (quantity: number, additionalFactor: number): number => {
  if (quantity <= 0) return 0
  if (quantity <= 1) return quantity
  return 1 + (quantity - 1) * additionalFactor
}

const computeStorageAreaPremium = (areaSqft: number): number => {
  if (areaSqft <= 0) return 0
  let remaining = areaSqft
  let lowerBound = 0
  let total = 0
  for (const tier of AMENITY_VALUATION_DEFAULTS.storageSqftTiers) {
    if (remaining <= 0) break
    const tierSpan = Number.isFinite(tier.upto) ? Math.max(0, tier.upto - lowerBound) : remaining
    const areaInTier = Math.min(remaining, tierSpan)
    total += areaInTier * tier.rate
    remaining -= areaInTier
    lowerBound = tier.upto
  }
  return total
}

export const computeAmenityMonthlyDelta = (input: {
  amenityId: string
  baseDelta: number
  modifier?: AmenityModifierInput
  /** Scales baseline monthly add-on (e.g. provincial utility cost index). Default 1. */
  regionalMultiplier?: number
}): number => {
  const { amenityId, baseDelta, modifier, regionalMultiplier = 1 } = input
  const mult = Number.isFinite(regionalMultiplier) && regionalMultiplier > 0 ? regionalMultiplier : 1
  const base = Math.max(0, baseDelta * mult)
  if (amenityId !== 'parking' && amenityId !== 'garage' && amenityId !== 'storage') {
    return base
  }

  const quantity = roundToHalf(clampPositive(modifier?.quantity, 1))
  const quantityMultiplier = computeQuantityMultiplier(quantity, AMENITY_VALUATION_DEFAULTS.additionalQuantityFactor)

  if (amenityId === 'storage') {
    const areaSqft = clampPositive(modifier?.areaSqft, 0)
    const areaPremium = computeStorageAreaPremium(areaSqft)
    return base * quantityMultiplier + areaPremium
  }

  const sharedFactor = amenityId === 'garage' && modifier?.shared ? AMENITY_VALUATION_DEFAULTS.sharedGarageFactor : 1
  return base * quantityMultiplier * sharedFactor
}

export const resolveAmenityMonthlyValue = (input: {
  enabled?: boolean
  amenityId: string
  baseDelta: number
  modifier?: AmenityModifierInput
  override?: number
  regionalMultiplier?: number
}): number => {
  if (input.enabled === false) return 0
  if (typeof input.override === 'number' && Number.isFinite(input.override)) {
    return Math.max(0, input.override)
  }
  return computeAmenityMonthlyDelta({
    amenityId: input.amenityId,
    baseDelta: input.baseDelta,
    modifier: input.modifier,
    regionalMultiplier: input.regionalMultiplier,
  })
}
