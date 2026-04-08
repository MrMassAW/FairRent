export type CanadaProvinceEntry = { code: string; name: string; sgc: string }

export type CanadaGeoDataset = {
  source: string
  generatedNote: string
  provinces: CanadaProvinceEntry[]
  municipalitiesByProvince: Record<string, string[]>
}
