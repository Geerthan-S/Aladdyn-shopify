import { z } from "zod";
import {
  quantitySchema,
  searchProductsSchema,
  shopifyProductIdSchema,
  shopifyVariantIdSchema,
} from "@shopify-adapter/schemas";
export {
  countrySchema,
  currencySchema,
  jsonRpcEnvelopeSchema,
  quantitySchema,
  searchProductsSchema,
  shopifyCartIdSchema,
  shopifyCheckoutIdSchema,
  shopifyProductIdSchema,
  shopifyVariantIdSchema,
  ucpProfileSchema,
} from "@shopify-adapter/schemas";

export const conversationIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9_-]+$/);

export const messageIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9_-]+$/);

export const explicitActionSchema = z.discriminatedUnion("tool", [
  z.object({
    tool: z.literal("search_products"),
    input: searchProductsSchema,
  }),
  z.object({
    tool: z.literal("recommend_products"),
    input: searchProductsSchema,
  }),
  z.object({ tool: z.literal("expand_results"), input: z.object({}) }),
  z.object({ tool: z.literal("recommend_previous"), input: z.object({}) }),
  z.object({
    tool: z.literal("get_product"),
    input: z.object({ productId: shopifyProductIdSchema }),
  }),
  z.object({
    tool: z.literal("add_product_to_cart"),
    input: z.object({
      productQuery: z.string().trim().min(1).max(300),
      quantity: quantitySchema.min(1),
    }),
  }),
  z.object({ tool: z.literal("view_cart"), input: z.object({}) }),
  z.object({
    tool: z.literal("add_to_cart"),
    input: z.object({
      variantId: shopifyVariantIdSchema,
      quantity: quantitySchema.min(1),
    }),
  }),
  z.object({
    tool: z.literal("remove_from_cart"),
    input: z.object({ variantId: shopifyVariantIdSchema }),
  }),
  z.object({
    tool: z.literal("change_quantity"),
    input: z.object({
      variantId: shopifyVariantIdSchema,
      quantity: quantitySchema,
    }),
  }),
  z.object({ tool: z.literal("checkout"), input: z.object({}) }),
  z.object({
    tool: z.literal("get_checkout_status"),
    input: z.object({}),
  }),
]);

export const chatRequestSchema = z.object({
  conversationId: conversationIdSchema,
  messageId: messageIdSchema,
  message: z.string().trim().min(1).max(1000),
  customerKey: z.string().trim().min(1).max(200).optional(),
  stream: z.boolean().default(false),
  action: explicitActionSchema.optional(),
});
