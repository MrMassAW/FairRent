/**
 * CMHC-style average rent rows (RMS).
 * Regenerate from the national RMS workbook: `npm run data:cmhc-rms`
 * Multi-workbook merge + quality grades: admin CMHC pipeline or `npm run data:cmhc-rms-merge`.
 */
import raw from './cmhc-rents.json'

/** CMHC estimate reliability letter (see workbook “Quality Indicators” footnote). */
export type CmhcRentQualityGrade = 'a' | 'b' | 'c' | 'd'

export interface CmhcRentRow {
  province: string
  city: string
  bedrooms: number
  structureType: string
  avgRent: number
  surveyYear: number
  /** Present when CMHC published a quality letter for that estimate. */
  rentQualityGrade?: CmhcRentQualityGrade
  /** Populated by `npm run data:canada-places` (GeoNames-backed municipality match). */
  lat?: number
  lng?: number
}

export const fallbackCmhcRents = raw as CmhcRentRow[]
