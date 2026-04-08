import type { CmhcRentRow } from '../../data/cmhcRents'
import type { UtilityPriceMonthly } from '../../types/adminData'
import { getRegionalUtilityFactors } from '../../data/regionalUtilityFactors'
import {
  fetchStatcanUtilitySnapshot,
  oilRatioForCmhcCity,
  provinceRatioElectricity,
  provinceRatioNaturalGas,
} from '../statcanUtilityIngest'
import { summarizeOebOntarioResidentialElectricity, type OebResidentialBillRow } from './oebBillData'

/** Keep UI multipliers in a sane band when official ratios spike. */
export const clampUtilityRatio = (n: number): number => Math.min(2.5, Math.max(0.35, n))

/** Rough Canada residential $/kWh reference for OEB-only fallback (when StatCan CSV fails). */
export const REFERENCE_CANADA_ELEC_NET_PER_KWH = 0.012

export const STATCAN_UTILITY_SOURCE_LABEL =
  'Statistics Canada — 18-10-0001-01 (oil), 25-10-0059-01 (gas), 18-10-0204-01 (electricity index)'

export type OebElectricityContext = {
  summary: NonNullable<ReturnType<typeof summarizeOebOntarioResidentialElectricity>>
  rows: OebResidentialBillRow[]
} | null

/**
 * Merge policy (documented):
 * 1. Prefer Statistics Canada WDS full-table CSV ratios for all provinces (electricity index, gas implied $/m³, oil CMA).
 * 2. When StatCan succeeds, optionally note OEB Ontario residential XML for transparency (source string).
 * 3. When StatCan fails, use seeded regional factors; for Ontario electricity only, blend OEB mean Net $/kWh vs national reference.
 */
export const buildUtilityPriceMonthlyRows = (params: {
  months: string[]
  latestSurveyRows: CmhcRentRow[]
  statcan: Awaited<ReturnType<typeof fetchStatcanUtilitySnapshot>>
  oeb: OebElectricityContext
}): UtilityPriceMonthly[] => {
  const { months, latestSurveyRows, statcan, oeb } = params

  let oebOnElecRatio: number | null = null
  if (oeb?.summary) {
    oebOnElecRatio = clampUtilityRatio(oeb.summary.meanNetPerKwh / REFERENCE_CANADA_ELEC_NET_PER_KWH)
  }

  return months.flatMap((month) =>
    latestSurveyRows.map((row): UtilityPriceMonthly => {
      const factors = getRegionalUtilityFactors(row.province)
      let electricity = factors.electricity
      let naturalGas = factors.naturalGas
      let oil = factors.oil
      let source = 'Local seeded factors'
      let sourceDate = new Date().toISOString().slice(0, 10)
      let quality: UtilityPriceMonthly['quality'] = 'estimated'

      if (statcan.ok) {
        const snap = statcan.snapshot
        const e = provinceRatioElectricity(snap, month, row.province)
        const g = provinceRatioNaturalGas(snap, month, row.province)
        const o = oilRatioForCmhcCity(snap, month, row.province, row.city)
        if (e !== null) electricity = clampUtilityRatio(e)
        if (g !== null) naturalGas = clampUtilityRatio(g)
        if (o !== null) {
          oil = clampUtilityRatio(o)
        } else {
          oil = factors.oil
        }
        source = oeb?.summary
          ? `${STATCAN_UTILITY_SOURCE_LABEL}; OEB BillData.xml (ON residential distributors n=${oeb.summary.count})`
          : STATCAN_UTILITY_SOURCE_LABEL
        sourceDate = `${month}-01`
        const complete = e !== null && g !== null && o !== null
        const partial = e !== null || g !== null || o !== null
        quality = complete ? 'verified' : partial ? 'carried-forward' : 'estimated'
      } else {
        if (row.province === 'ON' && oebOnElecRatio !== null) {
          electricity = oebOnElecRatio
          source = `OEB BillData.xml (Ontario residential, mean Net $/kWh vs ref ${REFERENCE_CANADA_ELEC_NET_PER_KWH}); seeded gas/oil`
          sourceDate = `${month}-01`
          quality = 'carried-forward'
        }
      }

      return {
        id: `${month}|${row.province}|${row.city}`,
        month,
        province: row.province,
        city: row.city,
        electricity,
        naturalGas,
        oil,
        source,
        sourceDate,
        quality,
      }
    }),
  )
}
