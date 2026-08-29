import type { CommerceProduct } from "@commerce-agent/providers/types";

export type ProductSearchInput = {
  query?: string;
  maxPrice?: number;
  currency?: string;
  country?: string;
  limit?: number;
};

export interface ProductProvider {
  searchProducts(input: ProductSearchInput): Promise<CommerceProduct[]>;
  getProduct(productId: string): Promise<CommerceProduct>;
}
