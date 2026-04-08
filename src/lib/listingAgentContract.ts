import type { AmenityModifierInput, CalculatorFormState } from '../types/calculator'

export type FieldAssessmentStatus = 'found' | 'warning' | 'unknown'

export interface FieldAssessment {
  status: FieldAssessmentStatus
  details: string
  evidence?: string
}

/** Partial calculator state the listing agent may fill (nested patches merged on the client). */
export interface ListingFormPatch {
  location?: Partial<CalculatorFormState['location']>
  unit?: Partial<CalculatorFormState['unit']>
  costs?: Partial<CalculatorFormState['costs']>
  assumptions?: Partial<CalculatorFormState['assumptions']>
  askingRent?: number
  manualMarketRent?: number
}

export interface ListingExtraction {
  formPatch: ListingFormPatch
  amenityEnabledPatch: Record<string, boolean>
  amenityOptionPatch: Record<string, string>
  amenityModifierPatch: Record<string, AmenityModifierInput>
  /** Optional per-amenity monthly override values */
  amenityOverridePatch: Record<string, number | undefined>
  notes: string[]
  fieldAssessments: Record<string, FieldAssessment>
}

export interface ListingAgentParseRequest {
  source: 'url' | 'memo'
  url?: string
  memo?: string
  /** When source is `memo`, optional label for the LLM (e.g. original listing URL after a separate fetch). */
  memoLabel?: string
}
