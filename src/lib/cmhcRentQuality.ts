import type { CmhcRentQualityGrade } from '../data/cmhcRents'

/** CMHC Rental Market Survey quality indicators (Table footnotes). */
export const CMHC_RENT_QUALITY_LABELS: Record<CmhcRentQualityGrade, string> = {
  a: 'Excellent',
  b: 'Very Good',
  c: 'Good',
  d: 'Poor',
}

export const cmhcRentQualityLabel = (g: CmhcRentQualityGrade | undefined): string | undefined =>
  g ? CMHC_RENT_QUALITY_LABELS[g] : undefined

export const parseQualityLetter = (raw: unknown): CmhcRentQualityGrade | undefined => {
  if (raw === undefined || raw === null) return undefined
  const s = String(raw).trim().toLowerCase()
  if (s === 'a' || s === 'b' || s === 'c' || s === 'd') return s
  return undefined
}
