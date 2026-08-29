import type { CommerceProduct } from "@commerce-agent/providers/types";

export interface ProductNormalizer<TRawProduct> {
  normalize(raw: TRawProduct, merchant: string): CommerceProduct | null;
  normalizeMany(raw: unknown, merchant: string): CommerceProduct[];
}
