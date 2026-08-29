import { canonicalMoney } from "@commerce-agent/money";
import type { CommerceProduct } from "@commerce-agent/providers/types";

export function productCardView(product: CommerceProduct) {
  return {
    productId: product.productId,
    title: product.title,
    price: canonicalMoney(product.price),
    availability: product.availability,
  };
}
