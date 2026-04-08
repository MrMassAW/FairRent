import { z } from 'zod'

/** LLMs often emit `null` for unknown numerics; `z.number().optional()` rejects that. */
const optionalNumber = z.number().nullable().optional()
const optionalBoolean = z.boolean().nullable().optional()

const fieldAssessmentSchema = z.object({
  status: z.enum(['found', 'warning', 'unknown']),
  details: z.string(),
  evidence: z.string().optional(),
})

const modifierSchema = z.object({
  quantity: optionalNumber,
  areaSqft: optionalNumber,
  shared: optionalBoolean,
})

/** Validates OpenAI JSON output before mapping to client `ListingExtraction`. */
export const llmParseResultSchema = z.object({
  notes: z.array(z.string()),
  formPatch: z
    .object({
      location: z
        .object({
          province: z.string().nullable().optional(),
          city: z.string().nullable().optional(),
          bedrooms: optionalNumber,
          buildingType: z.string().nullable().optional(),
          structureType: z.string().nullable().optional(),
        })
        .optional(),
      unit: z
        .object({
          squareFeet: optionalNumber,
        })
        .optional(),
      costs: z
        .object({
          mortgage: optionalNumber,
          propertyTax: optionalNumber,
          insurance: optionalNumber,
          condoFees: optionalNumber,
          utilities: optionalNumber,
          fixedFees: optionalNumber,
          other: optionalNumber,
          annualCapex: optionalNumber,
        })
        .optional(),
      assumptions: z
        .object({
          vacancyRate: optionalNumber,
          maintenanceRate: optionalNumber,
          annualReturnRate: optionalNumber,
          capitalInvested: optionalNumber,
        })
        .optional(),
      askingRent: optionalNumber,
      manualMarketRent: optionalNumber,
    })
    .optional(),
  amenities: z
    .object({
      enabled: z.record(z.string(), z.boolean()).optional(),
      options: z.record(z.string(), z.string()).optional(),
      modifiers: z.record(z.string(), modifierSchema).optional(),
      overrides: z.record(z.string(), z.number().nullable()).optional(),
    })
    .optional(),
  fieldAssessments: z.record(z.string(), fieldAssessmentSchema).optional(),
})

export type LlmParseResult = z.infer<typeof llmParseResultSchema>
