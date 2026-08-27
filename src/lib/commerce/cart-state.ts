import { quantitySchema, shopifyVariantIdSchema } from "@/lib/commerce/schemas";
import type { AuthoritativeCartState } from "@/lib/commerce/types";

export function addCartLine(
  state: AuthoritativeCartState,
  variantId: string,
  quantity: number,
): AuthoritativeCartState {
  const id = shopifyVariantIdSchema.parse(variantId);
  const amount = quantitySchema.min(1).parse(quantity);
  const lines = state.lineItems.map((line) => ({ ...line }));
  const existing = lines.find((line) => line.variantId === id);
  if (existing)
    existing.quantity = quantitySchema.parse(existing.quantity + amount);
  else lines.push({ variantId: id, quantity: amount });
  return { ...state, lineItems: lines };
}

export function removeCartLine(
  state: AuthoritativeCartState,
  variantId: string,
): AuthoritativeCartState {
  const id = shopifyVariantIdSchema.parse(variantId);
  return {
    ...state,
    lineItems: state.lineItems.filter((line) => line.variantId !== id),
  };
}

export function changeCartLineQuantity(
  state: AuthoritativeCartState,
  variantId: string,
  quantity: number,
): AuthoritativeCartState {
  const id = shopifyVariantIdSchema.parse(variantId);
  const amount = quantitySchema.parse(quantity);
  const lines = state.lineItems
    .map((line) =>
      line.variantId === id ? { ...line, quantity: amount } : { ...line },
    )
    .filter((line) => line.quantity > 0);
  if (!lines.some((line) => line.variantId === id) && amount > 0) {
    lines.push({ variantId: id, quantity: amount });
  }
  return { ...state, lineItems: lines };
}
