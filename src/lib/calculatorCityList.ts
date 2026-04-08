import { defaultState } from './defaultState'
import { fetchCitiesForProvince, fetchPlacesForProvince, isCanadaGeoApiConfigured } from './canadaGeoApi'

const sortUnique = (names: string[]): string[] =>
  [...new Set(names.map((s) => s.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))

/**
 * Municipal / geo city names for the calculator dropdown (not CMHC urban-centre labels).
 * Prefers `/geo/cities` when configured; otherwise municipality names from the places dataset slice.
 */
export async function loadCalculatorCityOptions(province: string): Promise<string[]> {
  const code = province.trim().toUpperCase()
  if (isCanadaGeoApiConfigured()) {
    try {
      const fromApi = await fetchCitiesForProvince(code)
      if (fromApi.length > 0) return sortUnique(fromApi)
    } catch {
      /* fall through */
    }
  }
  try {
    const places = await fetchPlacesForProvince(code)
    if (places?.municipalities?.length) {
      return sortUnique(places.municipalities.map((m) => m.name))
    }
  } catch {
    /* empty */
  }
  return []
}

/** When the loader returns nothing, seed the dropdown so the form stays usable. */
export function seedCalculatorCityOptions(fallbackCity: string): string[] {
  const t = fallbackCity.trim()
  if (!t) return [defaultState.location.city]
  return sortUnique([t, defaultState.location.city])
}
