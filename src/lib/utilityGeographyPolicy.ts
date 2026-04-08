/**
 * FairRent utility pricing geography policy (official data constraints).
 *
 * There is no single national feed that publishes residential electricity + natural gas +
 * heating oil in identical units for every municipality. Ingestion therefore uses:
 *
 * - **Heating oil / fuel oil**: Statistics Canada Table 18-10-0001-01 — monthly retail prices
 *   by geography including **CMA** (when StatCan labels match CMHC city / CMA names).
 * - **Natural gas**: Statistics Canada Table 25-10-0059-01 — **province/territory** level
 *   distribution survey; implied residential unit price is derived from revenue ÷ volume where
 *   those members exist in the published CSV.
 * - **Electricity**: Statistics Canada Table 18-10-0204-01 — **Electric power selling price index**
 *   by province (index, not $/kWh); used as a **relative** price signal vs Canada.
 *
 * Fallback: if StatCan fetch/parse fails, {@link ../data/regionalUtilityFactors} seeded factors apply.
 */
export const UTILITY_GEOGRAPHY_POLICY = {
  oil: 'cma_when_matched',
  naturalGas: 'province',
  electricity: 'province_index',
} as const

export type UtilityGeographyLevel = (typeof UTILITY_GEOGRAPHY_POLICY)[keyof typeof UTILITY_GEOGRAPHY_POLICY]
