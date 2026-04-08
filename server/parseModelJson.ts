import { llmParseResultSchema } from './llmOutput'
import { mapLlmToListingExtraction } from './mapToExtraction'
import type { ListingExtraction } from '../src/lib/listingAgentContract'

export const extractJsonObject = (content: string): unknown => {
  const trimmed = content.trim()
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/m)
  const jsonStr = fence ? fence[1].trim() : trimmed
  return JSON.parse(jsonStr) as unknown
}

export const validateAndMapListingJson = (content: string, providerLabel: string): ListingExtraction => {
  let parsed: unknown
  try {
    parsed = extractJsonObject(content)
  } catch {
    throw new Error(`${providerLabel} returned non-JSON output.`)
  }

  const validated = llmParseResultSchema.safeParse(parsed)
  if (!validated.success) {
    throw new Error(`Invalid model JSON: ${validated.error.message}`)
  }

  return mapLlmToListingExtraction(validated.data)
}
