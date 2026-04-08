import type { CanadaPlaceFsa, CanadaPlaceMunicipality, CanadaPlacesDataset } from '../types/canadaPlaces'

const normalizeKey = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')

const normalizeCityToken = (value: string) => normalizeKey(value).replace(/[^a-z0-9]/g, '')

const levenshteinDistance = (a: string, b: string): number => {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const prev = Array.from({ length: b.length + 1 }, (_, idx) => idx)
  const curr = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j]
  }
  return prev[b.length]
}

const normProv = (p: string) => p.trim().toUpperCase()

/** Normalize Canadian FSA: first 3 chars, letter-digit-letter */
export const normalizeCanadianFsa = (raw: string): string | null => {
  const s = raw.trim().toUpperCase().replace(/\s+/g, '')
  if (s.length < 3) return null
  const fsa = s.slice(0, 3)
  if (!/^[A-Z]\d[A-Z]$/.test(fsa)) return null
  return fsa
}

export function findFsaInPlaces(
  dataset: CanadaPlacesDataset,
  province: string,
  fsa: string,
): CanadaPlaceFsa | null {
  const p = normProv(province)
  const f = normalizeCanadianFsa(fsa)
  if (!f) return null
  return dataset.fsas.find((x) => x.province === p && x.fsa === f) ?? null
}

export function resolveMunicipalityFromPlaces(
  dataset: CanadaPlacesDataset,
  province: string,
  cityQuery: string,
): { municipality: CanadaPlaceMunicipality | null; method: 'exact' | 'fuzzy' | 'none' } {
  const p = normProv(province)
  const requested = cityQuery.trim()
  if (!requested) return { municipality: null, method: 'none' }

  const inProv = dataset.municipalities.filter((m) => m.province === p)
  const n = normalizeKey(requested)
  const exact = inProv.find((m) => normalizeKey(m.name) === n)
  if (exact) return { municipality: exact, method: 'exact' }

  const variants = [
    n,
    normalizeKey(requested.replace(/\bSt\.\b/gi, 'Saint')),
    normalizeKey(requested.replace(/\bSaint\b/gi, 'St.')),
  ]
  for (const v of variants) {
    const hit = inProv.find((m) => normalizeKey(m.name) === v)
    if (hit) return { municipality: hit, method: 'exact' }
  }

  const token = normalizeCityToken(requested)
  if (!token) return { municipality: null, method: 'none' }

  let best: CanadaPlaceMunicipality | null = null
  let bestDist = Infinity
  for (const m of inProv) {
    const ct = normalizeCityToken(m.name)
    if (!ct) continue
    const d = levenshteinDistance(token, ct)
    const maxLen = Math.max(1, token.length, ct.length)
    const score = 1 - d / maxLen
    if ((score >= 0.45 || d <= 4) && d < bestDist) {
      bestDist = d
      best = m
    }
  }
  return best ? { municipality: best, method: 'fuzzy' } : { municipality: null, method: 'none' }
}

export function resolveLatLngFromPlaces(
  dataset: CanadaPlacesDataset,
  province: string,
  city: string,
  fsa?: string | null,
): { lat: number; lng: number; via: 'fsa' | 'municipality' } | null {
  if (fsa) {
    const f = findFsaInPlaces(dataset, province, fsa)
    if (f) return { lat: f.lat, lng: f.lng, via: 'fsa' }
  }
  const { municipality } = resolveMunicipalityFromPlaces(dataset, province, city)
  if (municipality) return { lat: municipality.lat, lng: municipality.lng, via: 'municipality' }
  return null
}
