import "server-only";

import { createHash } from "node:crypto";
import {
  getEmbeddingProvider,
  isEmbeddingConfigured,
} from "@/lib/knowledge/embedding-provider";
import { createAdminSupabase } from "@/lib/supabase/admin";

type ProductRow = {
  id: string;
  shopify_product_id: string;
  name: string;
  category: string | null;
  vendor: string | null;
  description: string;
  tags: string[];
  colors: string[];
  sizes: string[];
  price_min: number | null;
  price_max: number | null;
  currency_code: string | null;
  availability: string;
  images: unknown;
};

export type RetrievedProduct = {
  productId: string;
  shopifyProductId: string;
  name: string;
  category: string | null;
  description: string;
  colors: string[];
  sizes: string[];
  priceMin: number | null;
  priceMax: number | null;
  currency: string | null;
  availability: string;
  imageUrl: string | null;
  similarity: number;
};

export async function refreshProductEmbeddings(input: {
  storeId: string;
  shopifyProductIds?: string[];
}) {
  if (!isEmbeddingConfigured()) {
    return { status: "not_configured" as const, updated: 0 };
  }
  const admin = createAdminSupabase();
  let query = admin
    .from("products")
    .select(
      "id,shopify_product_id,name,category,vendor,description,tags,colors,sizes,price_min,price_max,currency_code,availability,images",
    )
    .eq("store_id", input.storeId);
  if (input.shopifyProductIds?.length) {
    query = query.in(
      "shopify_product_id",
      input.shopifyProductIds.slice(0, 100),
    );
  }
  const { data, error } = await query;
  if (error) throw new Error("Unable to load products for embedding");
  const products = (data ?? []) as ProductRow[];
  if (!products.length) return { status: "ready" as const, updated: 0 };

  const ids = products.map((product) => product.id);
  const { data: existing } = await admin
    .from("product_embeddings")
    .select("product_id,content_hash")
    .in("product_id", ids);
  const hashes = new Map(
    (existing ?? []).map((row) => [row.product_id, row.content_hash]),
  );
  const documents = products.map((product) => ({
    product,
    text: productDocument(product),
  }));
  const changed = documents
    .map((item) => ({ ...item, hash: sha256(item.text) }))
    .filter((item) => hashes.get(item.product.id) !== item.hash);
  if (!changed.length) return { status: "ready" as const, updated: 0 };

  const provider = await getEmbeddingProvider();
  let updated = 0;
  for (let offset = 0; offset < changed.length; offset += 32) {
    const batch = changed.slice(offset, offset + 32);
    const embeddings = await provider.embed(
      batch.map((item) => item.text),
      "search_document",
    );
    const { error: upsertError } = await admin
      .from("product_embeddings")
      .upsert(
        batch.map((item, index) => ({
          product_id: item.product.id,
          store_id: input.storeId,
          embedding: embeddings[index],
          embedding_model: provider.model,
          content_hash: item.hash,
          metadata: {
            shopifyProductId: item.product.shopify_product_id,
            name: item.product.name,
          },
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "product_id" },
      );
    if (upsertError) throw new Error("Unable to store product embeddings");
    updated += batch.length;
  }
  return { status: "ready" as const, updated };
}

export async function retrieveProducts(
  storeId: string,
  query: string,
  limit = 8,
): Promise<RetrievedProduct[]> {
  if (!isEmbeddingConfigured() || !query.trim()) return [];
  const provider = await getEmbeddingProvider();
  const [embedding] = await provider.embed(
    [query.slice(0, 2_000)],
    "search_query",
  );
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("match_product_embeddings", {
    p_store_id: storeId,
    p_query_embedding: embedding,
    p_match_count: Math.min(Math.max(limit, 1), 12),
    p_similarity_threshold: 0.25,
  });
  if (error) throw new Error("Unable to retrieve relevant products");
  return (data ?? []).map((row: Record<string, unknown>) => ({
    productId: String(row.product_id),
    shopifyProductId: String(row.shopify_product_id),
    name: String(row.name),
    category: typeof row.category === "string" ? row.category : null,
    description: typeof row.description === "string" ? row.description : "",
    colors: Array.isArray(row.colors) ? row.colors.map(String) : [],
    sizes: Array.isArray(row.sizes) ? row.sizes.map(String) : [],
    priceMin: row.price_min == null ? null : Number(row.price_min),
    priceMax: row.price_max == null ? null : Number(row.price_max),
    currency: typeof row.currency_code === "string" ? row.currency_code : null,
    availability: String(row.availability ?? "unknown"),
    imageUrl: firstImageUrl(row.images),
    similarity: Number(row.similarity ?? 0),
  }));
}

function productDocument(product: ProductRow) {
  return [
    `Product: ${product.name}`,
    product.category ? `Category: ${product.category}` : "",
    product.vendor ? `Brand: ${product.vendor}` : "",
    product.colors.length ? `Colors: ${product.colors.join(", ")}` : "",
    product.sizes.length ? `Sizes: ${product.sizes.join(", ")}` : "",
    product.tags.length ? `Tags: ${product.tags.join(", ")}` : "",
    product.description.slice(0, 4_000),
  ]
    .filter(Boolean)
    .join("\n");
}

function firstImageUrl(value: unknown) {
  if (!Array.isArray(value)) return null;
  const first = value[0] as { url?: unknown } | undefined;
  return typeof first?.url === "string" ? first.url : null;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
