import "server-only";

import type { ConnectionRecord } from "@/lib/shopify/connection";
import { shopifyGraphQL } from "@/lib/shopify/admin-graphql";

const PRODUCTS_QUERY = `query SyncProducts($first:Int!,$after:String){
  shop { currencyCode }
  products(first:$first,after:$after,sortKey:UPDATED_AT){
    nodes {
      id title handle description vendor productType tags updatedAt totalInventory
      images(first:12){ nodes { url altText } }
      collections(first:20){ nodes { id title handle } }
      variants(first:100){ nodes {
        id title sku price inventoryQuantity availableForSale
        selectedOptions { name value }
        image { url altText }
      } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const PRODUCT_QUERY = `query SyncProduct($id:ID!){
  shop { currencyCode }
  product(id:$id) {
    id title handle description vendor productType tags updatedAt totalInventory
    images(first:12){ nodes { url altText } }
    collections(first:20){ nodes { id title handle } }
    variants(first:100){ nodes {
      id title sku price inventoryQuantity availableForSale
      selectedOptions { name value }
      image { url altText }
    } }
  }
}`;

type ShopifyProductNode = {
  id: string;
  title: string;
  handle: string | null;
  description: string | null;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  updatedAt: string;
  totalInventory: number | null;
  images: { nodes: Array<{ url: string; altText: string | null }> };
  collections: {
    nodes: Array<{ id: string; title: string; handle: string }>;
  };
  variants: {
    nodes: Array<{
      id: string;
      title: string;
      sku: string | null;
      price: string;
      inventoryQuantity: number | null;
      availableForSale: boolean;
      selectedOptions: Array<{ name: string; value: string }>;
      image: { url: string; altText: string | null } | null;
    }>;
  };
};

export type NormalizedProduct = ReturnType<typeof normalizeProduct>;

export async function fetchProductPage(
  connection: ConnectionRecord,
  after: string | null,
  first = 50,
) {
  const result = await shopifyGraphQL<{
    shop: { currencyCode: string };
    products: {
      nodes: ShopifyProductNode[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  }>(connection, PRODUCTS_QUERY, { first, after });
  return {
    products: result.data.products.nodes.map((node) =>
      normalizeProduct(node, result.data.shop.currencyCode),
    ),
    pageInfo: result.data.products.pageInfo,
  };
}

export async function fetchProductById(
  connection: ConnectionRecord,
  productId: string,
) {
  const result = await shopifyGraphQL<{
    shop: { currencyCode: string };
    product: ShopifyProductNode | null;
  }>(connection, PRODUCT_QUERY, { id: productId });
  return result.data.product
    ? normalizeProduct(result.data.product, result.data.shop.currencyCode)
    : null;
}

export function normalizeProduct(node: ShopifyProductNode, currency: string) {
  const prices = node.variants.nodes
    .map((variant) => Number(variant.price))
    .filter(Number.isFinite);
  const optionValues = (name: string) => [
    ...new Set(
      node.variants.nodes.flatMap((variant) =>
        variant.selectedOptions
          .filter((option) => option.name.toLowerCase() === name)
          .map((option) => option.value),
      ),
    ),
  ];
  return {
    shopify_product_id: node.id,
    handle: node.handle,
    name: node.title,
    category: node.productType || null,
    vendor: node.vendor || null,
    description: (node.description ?? "").slice(0, 8_000),
    tags: node.tags.slice(0, 100),
    colors: optionValues("color"),
    sizes: optionValues("size"),
    price_min: prices.length ? Math.min(...prices) : null,
    price_max: prices.length ? Math.max(...prices) : null,
    currency_code: currency,
    availability: node.variants.nodes.some(
      (variant) => variant.availableForSale,
    )
      ? "available"
      : node.totalInventory === null
        ? "unknown"
        : "unavailable",
    images: node.images.nodes,
    variants: node.variants.nodes.map((variant) => ({
      id: variant.id,
      title: variant.title,
      sku: variant.sku,
      price: variant.price,
      available: variant.availableForSale,
      inventoryQuantity: variant.inventoryQuantity,
      options: variant.selectedOptions,
      image: variant.image,
    })),
    collections: node.collections.nodes,
    source_updated_at: node.updatedAt,
    synced_at: new Date().toISOString(),
  };
}
