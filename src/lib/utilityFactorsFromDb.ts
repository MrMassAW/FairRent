import { getRegionalUtilityFactors, type RegionalUtilityFactors } from '../data/regionalUtilityFactors'
import { getLatestUtilityRowForCma } from './adminDataStore'

/**
 * Prefer latest monthly utility multipliers from the admin refresh pipeline (IndexedDB);
 * fall back to shipped regional seeds when no row exists.
 */
export const getRegionalUtilityFactorsResolved = async (
  province: string,
  city: string,
): Promise<RegionalUtilityFactors> => {
  const row = await getLatestUtilityRowForCma(province, city)
  if (!row) return getRegionalUtilityFactors(province)
  return {
    electricity: row.electricity,
    naturalGas: row.naturalGas,
    oil: row.oil,
  }
}
