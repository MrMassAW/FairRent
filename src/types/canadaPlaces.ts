/** Built by `npm run data:canada-places` (GeoNames + SGC municipality names). */

export type CanadaPlaceMunicipality = {
  province: string
  name: string
  lat: number
  lng: number
  /** GeoNames feature name used when different from SGC label */
  geonamesMatch?: string
}

export type CanadaPlaceFsa = {
  province: string
  /** Canadian forward sortation area (e.g. M5H) */
  fsa: string
  lat: number
  lng: number
  /** Representative place label from postal file */
  label: string
}

export type CanadaPlacesDataset = {
  source: string
  generatedNote: string
  generatedAt: string
  municipalities: CanadaPlaceMunicipality[]
  fsas: CanadaPlaceFsa[]
}
