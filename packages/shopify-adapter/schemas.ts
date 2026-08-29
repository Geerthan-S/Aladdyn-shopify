import { z } from "zod";

export const shopifyProductIdSchema = z
  .string()
  .regex(/^gid:\/\/shopify\/Product\/[A-Za-z0-9_-]+$/);

export const shopifyVariantIdSchema = z
  .string()
  .regex(/^gid:\/\/shopify\/ProductVariant\/[A-Za-z0-9_-]+$/);

export const shopifyCartIdSchema = z
  .string()
  .min(20)
  .max(1000)
  .regex(/^gid:\/\/shopify\/Cart\/[A-Za-z0-9_-]+(?:\?key=[A-Za-z0-9._~%-]+)?$/);

export const shopifyCheckoutIdSchema = z
  .string()
  .min(20)
  .max(1000)
  .regex(
    /^gid:\/\/shopify\/Checkout\/[A-Za-z0-9_-]+(?:\?key=[A-Za-z0-9._~%-]+)?$/,
  );

export const quantitySchema = z.number().int().min(0).max(100);
export const currencySchema = z.string().regex(/^[A-Z]{3}$/);
export const countrySchema = z.string().regex(/^[A-Z]{2}$/);

export const searchProductsSchema = z
  .object({
    query: z.string().trim().min(1).max(300).optional(),
    minPrice: z.number().nonnegative().max(10_000_000).optional(),
    maxPrice: z.number().nonnegative().max(10_000_000).optional(),
    targetPrice: z.number().nonnegative().max(10_000_000).optional(),
    strict: z.boolean().default(true),
    maxExclusive: z.boolean().default(false),
    displayMode: z.enum(["recommended", "expanded"]).default("recommended"),
    requiredTerms: z.array(z.string().trim().min(1).max(60)).max(8).optional(),
    currency: currencySchema.optional(),
    country: countrySchema.optional(),
    limit: z.number().int().min(1).max(10).default(6),
  })
  .refine(
    (input) =>
      input.query !== undefined ||
      input.minPrice !== undefined ||
      input.maxPrice !== undefined ||
      input.targetPrice !== undefined,
    {
      message: "Provide a product query or price filter",
    },
  );

const versionedEntitySchema = z.object({ version: z.string() }).passthrough();
const serviceSchema = versionedEntitySchema.extend({
  transport: z.string(),
  endpoint: z.url().optional(),
});

export const ucpProfileSchema = z.object({
  ucp: z.object({
    version: z.string(),
    supported_versions: z.record(z.string(), z.url()).optional(),
    services: z.record(z.string(), z.array(serviceSchema)).optional(),
    capabilities: z.record(z.string(), z.array(versionedEntitySchema)),
  }),
});

export const jsonRpcEnvelopeSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  result: z
    .object({
      structuredContent: z.unknown().optional(),
      content: z.array(z.unknown()).optional(),
      isError: z.boolean().optional(),
      tools: z.array(z.unknown()).optional(),
    })
    .passthrough()
    .optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
      data: z.unknown().optional(),
    })
    .optional(),
});
