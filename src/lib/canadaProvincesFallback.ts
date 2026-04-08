/** Used when `/geo/provinces` is unavailable (no listing agent URL or network error). */
export type CanadaProvinceOption = { code: string; name: string; sgc: string }

export const CANADA_PROVINCES_FALLBACK: CanadaProvinceOption[] = [
  { sgc: '10', code: 'NL', name: 'Newfoundland and Labrador' },
  { sgc: '11', code: 'PE', name: 'Prince Edward Island' },
  { sgc: '12', code: 'NS', name: 'Nova Scotia' },
  { sgc: '13', code: 'NB', name: 'New Brunswick' },
  { sgc: '24', code: 'QC', name: 'Quebec' },
  { sgc: '35', code: 'ON', name: 'Ontario' },
  { sgc: '46', code: 'MB', name: 'Manitoba' },
  { sgc: '47', code: 'SK', name: 'Saskatchewan' },
  { sgc: '48', code: 'AB', name: 'Alberta' },
  { sgc: '59', code: 'BC', name: 'British Columbia' },
  { sgc: '60', code: 'YT', name: 'Yukon' },
  { sgc: '61', code: 'NT', name: 'Northwest Territories' },
  { sgc: '62', code: 'NU', name: 'Nunavut' },
]
