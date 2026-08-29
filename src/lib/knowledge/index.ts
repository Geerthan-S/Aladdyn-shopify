import "server-only";

import { createHash } from "node:crypto";
import {
  getEmbeddingProvider,
  isEmbeddingConfigured,
} from "@/lib/knowledge/embedding-provider";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const KNOWLEDGE_TYPES = [
  "SHIPPING",
  "RETURNS",
  "PAYMENT",
  "FAQ",
  "BRAND_VOICE",
  "POLICIES",
] as const;
export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number];

export type RetrievedKnowledge = {
  id: string;
  type: KnowledgeType;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
};

export async function addKnowledge(input: {
  storeId: string;
  type: KnowledgeType;
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const content = input.content.trim();
  if (!content || content.length > 20_000)
    throw new Error("Invalid merchant knowledge");
  if (!isEmbeddingConfigured())
    throw new Error("Embedding provider is not configured");
  const provider = await getEmbeddingProvider();
  const [embedding] = await provider.embed([content], "search_document");
  const contentHash = createHash("sha256").update(content).digest("hex");
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("merchant_knowledge")
    .upsert(
      {
        store_id: input.storeId,
        type: input.type,
        content,
        embedding,
        embedding_model: provider.model,
        content_hash: contentHash,
        metadata: input.metadata ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store_id,type,content_hash" },
    )
    .select("id,type,content,metadata")
    .single();
  if (error || !data) throw new Error("Unable to save merchant knowledge");
  return data;
}

export async function retrieveKnowledge(
  storeId: string,
  query: string,
  limit = 5,
): Promise<RetrievedKnowledge[]> {
  if (!isEmbeddingConfigured() || !query.trim()) return [];
  const provider = await getEmbeddingProvider();
  const [embedding] = await provider.embed(
    [query.slice(0, 2_000)],
    "search_query",
  );
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("match_merchant_knowledge", {
    p_store_id: storeId,
    p_query_embedding: embedding,
    p_match_count: Math.min(Math.max(limit, 1), 8),
    p_similarity_threshold: 0.2,
  });
  if (error) throw new Error("Unable to retrieve merchant knowledge");
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    type: String(row.type) as KnowledgeType,
    content: String(row.content).slice(0, 4_000),
    metadata:
      row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    similarity: Number(row.similarity ?? 0),
  }));
}
