import type { CostInput, RentAssumptionsInput, RentCalculation } from '../types/calculator'

const clampPercent = (value: number) => Math.min(100, Math.max(0, value))

const toMonthly = (annualValue: number) => Math.max(0, annualValue) / 12

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export const calculateRent = (
  costs: CostInput,
  assumptions: RentAssumptionsInput,
): RentCalculation => {
  const monthlyRecurring = Math.max(0, costs.mortgage) +
    Math.max(0, costs.propertyTax) +
    Math.max(0, costs.insurance) +
    Math.max(0, costs.condoFees) +
    Math.max(0, costs.utilities) +
    Math.max(0, costs.fixedFees) +
    Math.max(0, costs.other)

  const vacancyRatio = clampPercent(assumptions.vacancyRate) / 100
  const safeDenominator = Math.max(0.05, 1 - vacancyRatio)
  const adjustedRecurring = monthlyRecurring / safeDenominator
  const bareMinimum = adjustedRecurring + toMonthly(costs.annualCapex)

  const maintenanceRatio = clampPercent(assumptions.maintenanceRate) / 100
  const maintenanceReserve = bareMinimum * maintenanceRatio

  const returnRatio = clampPercent(assumptions.annualReturnRate) / 100
  const monthlyReturnTarget = (Math.max(0, assumptions.capitalInvested) * returnRatio) / 12

  const fairTarget = bareMinimum + maintenanceReserve + monthlyReturnTarget

  return {
    monthlyRecurring: roundCurrency(monthlyRecurring),
    adjustedRecurring: roundCurrency(adjustedRecurring),
    bareMinimum: roundCurrency(bareMinimum),
    maintenanceReserve: roundCurrency(maintenanceReserve),
    monthlyReturnTarget: roundCurrency(monthlyReturnTarget),
    fairTarget: roundCurrency(fairTarget),
  }
}
