import { z } from "zod";

export const DATASET_NAMES = [
  "shop",
  "scopes",
  "products",
  "variants",
  "collections",
  "inventory",
  "locations",
  "orders",
  "discounts",
  "protected-data",
] as const;

export type DatasetName = (typeof DATASET_NAMES)[number];

export const datasetNameSchema = z.enum(DATASET_NAMES);

const cursorSchema = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^[A-Za-z0-9+/=_-]+$/, "Invalid cursor");

export const paginationSchema = z
  .object({
    after: cursorSchema.optional(),
    before: cursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .refine((value) => !(value.after && value.before), {
    message: "Use either an after or before cursor, not both",
  });

export type PaginationInput = z.infer<typeof paginationSchema>;

export const DATASET_SCOPES: Record<DatasetName, readonly string[]> = {
  shop: [],
  scopes: [],
  products: ["read_products"],
  variants: ["read_products"],
  collections: ["read_products"],
  inventory: ["read_inventory"],
  locations: ["read_locations"],
  orders: ["read_orders"],
  discounts: ["read_discounts"],
  "protected-data": [],
};

const connectionFields = `
  pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
`;

export const DATASET_QUERIES: Partial<Record<DatasetName, string>> = {
  shop: `query ShopInspector { shop { id name myshopifyDomain primaryDomain { host url } email currencyCode billingAddress { countryCodeV2 } ianaTimezone plan { displayName } } }`,
  scopes: `query GrantedScopes { appInstallation { accessScopes { handle } } }`,
  products: `query Products($first:Int,$last:Int,$after:String,$before:String){ products(first:$first,last:$last,after:$after,before:$before,sortKey:UPDATED_AT,reverse:true){ nodes { id title handle status vendor productType tags createdAt updatedAt totalInventory featuredMedia { preview { image { url altText } } } } ${connectionFields} } }`,
  variants: `query Variants($first:Int,$last:Int,$after:String,$before:String){ productVariants(first:$first,last:$last,after:$after,before:$before,sortKey:UPDATED_AT,reverse:true){ nodes { id title sku barcode price compareAtPrice inventoryQuantity selectedOptions { name value } product { id title handle } inventoryItem { id tracked } } ${connectionFields} } }`,
  collections: `query Collections($first:Int,$last:Int,$after:String,$before:String){ collections(first:$first,last:$last,after:$after,before:$before,sortKey:UPDATED_AT,reverse:true){ nodes { id title handle description updatedAt sortOrder productsCount { count } ruleSet { appliedDisjunctively } } ${connectionFields} } }`,
  inventory: `query Inventory($first:Int,$last:Int,$after:String,$before:String){ inventoryItems(first:$first,last:$last,after:$after,before:$before){ nodes { id sku tracked variant { id title product { id title } } inventoryLevels(first:10){ nodes { id location { id name } quantities(names:["available","on_hand"]){ name quantity } } } } ${connectionFields} } }`,
  locations: `query Locations($first:Int,$last:Int,$after:String,$before:String){ locations(first:$first,last:$last,after:$after,before:$before,includeInactive:true){ nodes { id legacyResourceId name isActive fulfillsOnlineOrders address { address1 address2 city provinceCode countryCode zip } } ${connectionFields} } }`,
  orders: `query Orders($first:Int,$last:Int,$after:String,$before:String){ orders(first:$first,last:$last,after:$after,before:$before,sortKey:CREATED_AT,reverse:true){ nodes { id name createdAt displayFinancialStatus displayFulfillmentStatus currencyCode currentTotalPriceSet { shopMoney { amount currencyCode } } currentSubtotalLineItemsQuantity test cancelledAt } ${connectionFields} } }`,
  discounts: `query Discounts($first:Int,$last:Int,$after:String,$before:String){ discountNodes(first:$first,last:$last,after:$after,before:$before,sortKey:UPDATED_AT,reverse:true){ nodes { id discount { __typename ... on DiscountCodeBasic { title status startsAt endsAt summary asyncUsageCount codesCount { count } } ... on DiscountCodeBxgy { title status startsAt endsAt summary asyncUsageCount codesCount { count } } ... on DiscountCodeFreeShipping { title status startsAt endsAt summary asyncUsageCount codesCount { count } } ... on DiscountCodeApp { title status startsAt endsAt asyncUsageCount codesCount { count } appDiscountType { title } } ... on DiscountAutomaticBasic { title status startsAt endsAt summary } ... on DiscountAutomaticBxgy { title status startsAt endsAt summary } ... on DiscountAutomaticFreeShipping { title status startsAt endsAt summary } ... on DiscountAutomaticApp { title status startsAt endsAt appDiscountType { title } } } } ${connectionFields} } }`,
};

export function paginationVariables(input: PaginationInput) {
  return input.before
    ? { first: null, last: input.limit, after: null, before: input.before }
    : {
        first: input.limit,
        last: null,
        after: input.after ?? null,
        before: null,
      };
}
