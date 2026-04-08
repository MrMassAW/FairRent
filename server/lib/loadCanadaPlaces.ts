import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CanadaPlacesDataset } from './canadaPlacesTypes'

let cached: CanadaPlacesDataset | null = null
let loadError: string | null = null

export const getCanadaPlacesDataset = (): CanadaPlacesDataset | null => {
  if (cached) return cached
  if (loadError) return null
  try {
    const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'canadaPlaces.json')
    const raw = readFileSync(path, 'utf8')
    cached = JSON.parse(raw) as CanadaPlacesDataset
    return cached
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e)
    return null
  }
}

export const getCanadaPlacesLoadError = (): string | null => loadError

export const clearCanadaPlacesCache = (): void => {
  cached = null
  loadError = null
}
