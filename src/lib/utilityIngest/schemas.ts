import { z } from 'zod'

/** Versioned ingestor config (see data/utility-ingestor/canada-utility-data-ingestor.json). */
export const utilityIngestorConfigSchema = z.object({
  project_name: z.string(),
  version: z.string(),
  notes: z.string().optional(),
  data_sources: z.array(z.record(z.unknown())),
  ingestion_schema: z.object({
    target_fields: z.array(z.string()),
  }),
})

export const utilityTypeSchema = z.enum(['electricity', 'natural_gas', 'oil', 'propane', 'mixed', 'other'])

export const canonicalUtilityRowSchema = z.object({
  source_provider: z.string(),
  utility_type: utilityTypeSchema,
  region: z.string(),
  effective_date: z.string(),
  unit_cost_cad: z.number().nullable(),
  fixed_monthly_fee: z.number().nullable(),
  currency: z.literal('CAD'),
  unit_of_measure: z.string(),
  notes: z.string().optional(),
})

export type CanonicalUtilityRow = z.infer<typeof canonicalUtilityRowSchema>
