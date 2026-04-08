export type LatLng = { lat: number; lng: number }

export const toRadians = (deg: number) => (deg * Math.PI) / 180

/** Great-circle distance (Haversine), km. */
export const haversineKm = (a: LatLng, b: LatLng): number => {
  const R = 6371
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export type DistanceBandKm = { maxKm: number; factor: number }

export const normalizeBandsKm = (bands: DistanceBandKm[]): DistanceBandKm[] => {
  const cleaned = (Array.isArray(bands) ? bands : [])
    .map((b) => ({
      maxKm: Number.isFinite(b.maxKm) ? b.maxKm : Infinity,
      factor: Number.isFinite(b.factor) ? b.factor : 1,
    }))
    .filter((b) => b.maxKm >= 0 && b.factor > 0)
    .sort((a, b) => a.maxKm - b.maxKm)
  return cleaned.length ? cleaned : [{ maxKm: Infinity, factor: 1 }]
}

export const stepwiseFactorForKm = (distanceKm: number, bandsKm: DistanceBandKm[], floorFactor: number): number => {
  const d = Math.max(0, distanceKm)
  const floor = Number.isFinite(floorFactor) ? Math.max(0, floorFactor) : 0
  const bands = normalizeBandsKm(bandsKm)
  const hit = bands.find((b) => d <= b.maxKm) ?? bands[bands.length - 1]
  const f = Number.isFinite(hit.factor) ? hit.factor : 1
  return Math.max(floor, Math.max(0, f))
}

