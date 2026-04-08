import type { StatcanAskingRentQuarterly } from '../types/adminData'
import { readAllStatcanAskingRentsQuarterly } from './adminDataStore'

export type MarketReferenceInputs = {
  province: string
  city: string
  bedrooms: number
  cmhcAverageRent: number
}

export type MarketReferenceResult = {
  cmhcAverageRent: number
  statcanAskingRent: number | null
  blendedMarketRent: number
  blendWeight: number
  statcan?: {
    refDate: string
    quality: StatcanAskingRentQuarterly['quality']
    source: StatcanAskingRentQuarterly['source']
  }
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')

const parseQuarterKey = (refDate: string): { year: number; quarter: number } | null => {
  const m = refDate.trim().match(/^(\d{4})\s*Q([1-4])$/i)
  if (!m) return null
  return { year: Number(m[1]), quarter: Number(m[2]) }
}

const currentQuarterKey = (): { year: number; quarter: number } => {
  const d = new Date()
  const year = d.getUTCFullYear()
  const quarter = Math.floor(d.getUTCMonth() / 3) + 1
  return { year, quarter }
}

const quarterDistance = (a: { year: number; quarter: number }, b: { year: number; quarter: number }): number => {
  const ai = a.year * 4 + (a.quarter - 1)
  const bi = b.year * 4 + (b.quarter - 1)
  return Math.abs(ai - bi)
}

const pickLatestStatcanRow = (
  rows: StatcanAskingRentQuarterly[],
  input: { province: string; city: string; bedrooms: number },
): StatcanAskingRentQuarterly | null => {
  const prov = input.province.trim().toUpperCase()
  const cityN = norm(input.city)
  const matches = rows.filter(
    (r) => r.province.toUpperCase() === prov && r.bedrooms === input.bedrooms && norm(r.cma) === cityN,
  )
  if (matches.length === 0) return null
  matches.sort((a, b) => (a.refDate < b.refDate ? 1 : a.refDate > b.refDate ? -1 : 0))
  return matches[0] ?? null
}

const computeBlendWeight = (row: StatcanAskingRentQuarterly | null): number => {
  if (!row) return 0
  const base = row.quality === 'estimated' ? 0.35 : 0.6
  const q = parseQuarterKey(row.refDate)
  if (!q) return base * 0.5
  const dist = quarterDistance(q, currentQuarterKey())
  if (dist <= 2) return base
  if (dist <= 4) return base * 0.75
  return base * 0.5
}

/**
 * Computes a market reference rent that considers both:
 * - CMHC annual average rent (anchor)
 * - StatCan quarterly asking rent (timeliness overlay) when present
 */
export const buildMarketReference = async (input: MarketReferenceInputs): Promise<MarketReferenceResult> => {
  const cmhcAverageRent = Math.max(0, input.cmhcAverageRent)
  let statcanRow: StatcanAskingRentQuarterly | null = null
  try {
    const all = await readAllStatcanAskingRentsQuarterly()
    statcanRow = pickLatestStatcanRow(all, {
      province: input.province,
      city: input.city,
      bedrooms: input.bedrooms,
    })
  } catch {
    statcanRow = null
  }

  const w = computeBlendWeight(statcanRow)
  const statcanAskingRent = statcanRow ? Math.max(0, statcanRow.askingRent) : null
  const blendedMarketRent =
    statcanAskingRent === null ? cmhcAverageRent : Math.round(w * statcanAskingRent + (1 - w) * cmhcAverageRent)

  return {
    cmhcAverageRent,
    statcanAskingRent,
    blendedMarketRent,
    blendWeight: w,
    ...(statcanRow
      ? {
          statcan: {
            refDate: statcanRow.refDate,
            quality: statcanRow.quality,
            source: statcanRow.source,
          },
        }
      : {}),
  }
}

