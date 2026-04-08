import type { CalculatorFormState } from '../types/calculator'

export const defaultState: CalculatorFormState = {
  location: {
    province: 'ON',
    city: 'Toronto',
    bedrooms: 1,
    buildingType: 'apartment',
    structureType: 'purpose-built',
  },
  unit: {},
  costs: {
    mortgage: 1200,
    propertyTax: 350,
    insurance: 80,
    condoFees: 0,
    utilities: 120,
    fixedFees: 40,
    other: 0,
    annualCapex: 1800,
  },
  assumptions: {
    vacancyRate: 2,
    maintenanceRate: 6,
    annualReturnRate: 4,
    capitalInvested: 50000,
  },
  askingRent: 2500,
  amenities: {
    enabled: {},
    options: {},
    modifiers: {
      parking: { quantity: 1 },
      garage: { quantity: 1, shared: false },
      storage: { quantity: 1, areaSqft: 0 },
    },
    overrides: {},
  },
}
