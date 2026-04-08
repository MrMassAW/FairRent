/**
 * Map CMHC RMS `city` strings (CMA names) to Statistics Canada Table 18-10-0001-01 `GEO`
 * labels for **Household heating fuel** rows.
 *
 * StatCan uses French diacritics and combined CMA labels (e.g. Ottawa–Gatineau parts).
 * When no alias matches, we try a **fuzzy** match against GEO labels seen in the oil table
 * for the same province (same month slice).
 */

export const CMHC_CITY_TO_STATCAN_GEO: Record<string, string> = {
  // CMHC / common English → StatCan GEO (oil table)
  Montreal: 'Montréal, Quebec',
  'Montréal': 'Montréal, Quebec',
  Ottawa: 'Ottawa-Gatineau, Ontario part, Ontario/Quebec',
  'Québec': 'Québec, Quebec',
  Quebec: 'Québec, Quebec',
  'St. Catharines - Niagara': 'St. Catharines-Niagara, Ontario',
  'St. Catharines-Niagara': 'St. Catharines-Niagara, Ontario',
  "St. John's": "St. John's, Newfoundland and Labrador",
  // Hyphen vs en-dash variants
  'Kitchener - Cambridge - Waterloo': 'Kitchener-Cambridge-Waterloo, Ontario',
  'Kitchener-Cambridge-Waterloo': 'Kitchener-Cambridge-Waterloo, Ontario',
}

const normalizeKey = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[–—]/g, '-')

/** Province hint: helps disambiguate duplicate city names (rare). */
export const resolveCmhcCityToStatcanGeo = (
  provinceCode: string,
  cmhcCity: string,
  candidateGeos: readonly string[],
): string | null => {
  const direct = CMHC_CITY_TO_STATCAN_GEO[cmhcCity]
  if (direct && candidateGeos.includes(direct)) {
    return direct
  }
  const nCity = normalizeKey(cmhcCity)
  const aliasHit = Object.entries(CMHC_CITY_TO_STATCAN_GEO).find(([k]) => normalizeKey(k) === nCity)
  if (aliasHit && candidateGeos.includes(aliasHit[1])) {
    return aliasHit[1]
  }

  const provLower = provinceCode.trim().toUpperCase()
  const provSuffix =
    provLower === 'QC'
      ? 'quebec'
      : provLower === 'ON'
        ? 'ontario'
        : provLower === 'BC'
          ? 'british columbia'
          : provLower === 'AB'
            ? 'alberta'
            : provLower === 'MB'
              ? 'manitoba'
              : provLower === 'SK'
                ? 'saskatchewan'
                : provLower === 'NB'
                  ? 'new brunswick'
                  : provLower === 'NS'
                    ? 'nova scotia'
                    : provLower === 'PE'
                      ? 'prince edward island'
                      : provLower === 'NL'
                        ? 'newfoundland and labrador'
                        : provLower === 'YT'
                          ? 'yukon'
                          : provLower === 'NT'
                            ? 'northwest territories'
                            : provLower === 'NU'
                              ? 'nunavut'
                              : ''

  const filtered = candidateGeos.filter((g) => {
    if (!provSuffix) return true
    return g.toLowerCase().endsWith(provSuffix) || g.toLowerCase().includes(`, ${provSuffix}`)
  })

  const cityNorm = nCity.replace(/\s+/g, ' ')
  const stripPart = (g: string) =>
    g
      .replace(/, (ontario|quebec|british columbia|alberta)\/(ontario|quebec).*/i, '')
      .replace(/, (ontario|quebec|british columbia|alberta|manitoba|saskatchewan|new brunswick|nova scotia|prince edward island|newfoundland and labrador|yukon|northwest territories|nunavut)$/i, '')
      .trim()

  const exact = filtered.find((g) => normalizeKey(stripPart(g)) === cityNorm)
  if (exact) return exact

  const contains = filtered.find((g) => {
    const head = normalizeKey(stripPart(g))
    return head.includes(cityNorm) || cityNorm.includes(head)
  })
  if (contains) return contains

  const fuzzy = filtered.find((g) => {
    const head = normalizeKey(stripPart(g)).replace(/[^a-z0-9]/g, '')
    const c = cityNorm.replace(/[^a-z0-9]/g, '')
    return c.length >= 4 && (head.includes(c) || c.includes(head))
  })
  return fuzzy ?? null
}
