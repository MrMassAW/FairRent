import type { AmenityModifierInput } from '../src/types/calculator'
import type { ListingExtraction } from '../src/lib/listingAgentContract'
import type { LlmParseResult } from './llmOutput'

const omitNullish = (obj: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
  if (!obj) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) out[k] = v
  }
  return Object.keys(out).length ? out : undefined
}

const cleanModifiers = (
  raw: Record<string, { quantity?: number | null; areaSqft?: number | null; shared?: boolean | null }> | undefined,
): Record<string, AmenityModifierInput> => {
  if (!raw) return {}
  const out: Record<string, AmenityModifierInput> = {}
  for (const [id, mod] of Object.entries(raw)) {
    const piece: AmenityModifierInput = {}
    if (typeof mod.quantity === 'number') piece.quantity = mod.quantity
    if (typeof mod.areaSqft === 'number') piece.areaSqft = mod.areaSqft
    if (typeof mod.shared === 'boolean') piece.shared = mod.shared
    if (Object.keys(piece).length > 0) out[id] = piece
  }
  return out
}

export const mapLlmToListingExtraction = (raw: LlmParseResult): ListingExtraction => {
  const fp = raw.formPatch ?? {}
  const formPatch: ListingExtraction['formPatch'] = {}

  const location = omitNullish(fp.location as Record<string, unknown> | undefined)
  if (location) formPatch.location = location as ListingExtraction['formPatch']['location']

  const unit = omitNullish(fp.unit as Record<string, unknown> | undefined)
  if (unit) formPatch.unit = unit as ListingExtraction['formPatch']['unit']

  const costs = omitNullish(fp.costs as Record<string, unknown> | undefined)
  if (costs) formPatch.costs = costs as ListingExtraction['formPatch']['costs']

  const assumptions = omitNullish(fp.assumptions as Record<string, unknown> | undefined)
  if (assumptions) formPatch.assumptions = assumptions as ListingExtraction['formPatch']['assumptions']

  if (typeof fp.askingRent === 'number') formPatch.askingRent = fp.askingRent
  if (typeof fp.manualMarketRent === 'number') formPatch.manualMarketRent = fp.manualMarketRent

  const am = raw.amenities ?? {}
  const amenityOverridePatch: Record<string, number | undefined> = {}
  if (am.overrides) {
    for (const [k, v] of Object.entries(am.overrides)) {
      amenityOverridePatch[k] = v === null ? undefined : v
    }
  }

  return {
    formPatch,
    amenityEnabledPatch: { ...(am.enabled ?? {}) },
    amenityOptionPatch: { ...(am.options ?? {}) },
    amenityModifierPatch: cleanModifiers(am.modifiers),
    amenityOverridePatch,
    notes: [...raw.notes],
    fieldAssessments: { ...(raw.fieldAssessments ?? {}) },
  }
}
