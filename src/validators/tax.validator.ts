import { z } from "zod";

const rateValueSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("percentage"),
    value: z.number().min(0).max(100),
    raw: z.string().min(1),
    basis: z.string().optional(),
  }),
  z.object({
    kind: z.literal("formula"),
    expression: z.string().min(1),
    raw: z.string().min(1),
  }),
  z.object({
    kind: z.literal("text"),
    value: z.string().min(1),
    raw: z.string().min(1),
  }),
]);

export const taxRuleSchema = z.object({
  id: z.string().min(1),
  section: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),
  conditions: z.array(z.string()),
  rates: z.array(
    z.object({
      appliesTo: z.enum(["all", "atl", "non_atl"]),
      calculation: rateValueSchema,
    }),
  ).min(1),
  reference: z.string().optional(),
  notes: z.string().optional(),
  source: z.object({
    authority: z.string().min(1),
    url: z.string().url(),
    documentUrl: z.string().url(),
    documentName: z.string().min(1),
    retrievedAt: z.string().datetime(),
    location: z.string().min(1),
  }),
});

const sourceDocumentSchema = z.object({
  authority: z.string().min(1),
  url: z.string().url(),
  documentUrl: z.string().url(),
  documentName: z.string().min(1),
  retrievedAt: z.string().datetime(),
});

export const taxSchema = z.object({
  country: z.literal("PK"),
  currency: z.literal("PKR"),
  version: z.string().min(1),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().nullable(),
  updated_at: z.string().datetime(),
  taxes: z.object({
    sales_tax: z.array(taxRuleSchema),
    withholding_tax: z.array(taxRuleSchema),
    income_tax: z.array(taxRuleSchema),
    fed: z.array(taxRuleSchema),
  }),
  source: z.object({
    authority: z.string().min(1),
    url: z.string().url(),
    documents: z.array(sourceDocumentSchema).min(1),
  }),
});

export type TaxRateValue = z.infer<typeof rateValueSchema>;
export type TaxRule = z.infer<typeof taxRuleSchema>;
export type TaxDocumentSource = z.infer<typeof sourceDocumentSchema>;
export type TaxData = z.infer<typeof taxSchema>;
