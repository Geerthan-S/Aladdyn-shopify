import type { CommerceProduct } from "@commerce-agent/providers/types";

export type ProductSearchInput = {
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  targetPrice?: number;
  strict?: boolean;
  maxExclusive?: boolean;
  displayMode?: "recommended" | "expanded";
  requiredTerms?: string[];
  currency?: string;
  country?: string;
  limit?: number;
};

export interface ProductProvider {
  searchProducts(input: ProductSearchInput): Promise<CommerceProduct[]>;
  getProduct(productId: string): Promise<CommerceProduct>;
}
