export interface LocationInput {
  province: string
  city: string
  bedrooms: number
  /** User-facing type; drives CMHC structure bucket and market-reference multiplier. */
  buildingType?: string
  structureType?: string
}

export interface UnitInput {
  squareFeet?: number
}

export interface AmenityModifierInput {
  quantity?: number
  areaSqft?: number
  shared?: boolean
}

export interface AmenityStateInput {
  enabled: Record<string, boolean>
  options: Record<string, string>
  modifiers: Record<string, AmenityModifierInput>
  overrides?: Record<string, number | undefined>
}

export interface CostInput {
  mortgage: number
  propertyTax: number
  insurance: number
  condoFees: number
  utilities: number
  fixedFees: number
  other: number
  annualCapex: number
}

export interface RentAssumptionsInput {
  vacancyRate: number
  maintenanceRate: number
  annualReturnRate: number
  capitalInvested: number
}

export interface CalculatorFormState {
  location: LocationInput
  unit: UnitInput
  costs: CostInput
  assumptions: RentAssumptionsInput
  askingRent?: number
  manualMarketRent?: number
  amenities?: AmenityStateInput
}

export interface RentCalculation {
  monthlyRecurring: number
  adjustedRecurring: number
  bareMinimum: number
  maintenanceReserve: number
  monthlyReturnTarget: number
  fairTarget: number
}
