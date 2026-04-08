import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CanadaGeoDataset } from './canadaGeoTypes'

let cached: CanadaGeoDataset | null = null
let loadError: string | null = null

export const getCanadaGeoDataset = (): CanadaGeoDataset | null => {
  if (cached) return cached
  if (loadError) return null
  try {
    const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'canadaGeo.json')
    const raw = readFileSync(path, 'utf8')
    cached = JSON.parse(raw) as CanadaGeoDataset
    return cached
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e)
    return null
  }
}

export const getCanadaGeoLoadError = (): string | null => loadError
