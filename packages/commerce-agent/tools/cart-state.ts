import type { AuthoritativeCartState } from "@commerce-agent/providers/types";

function commerceItemId(value: string) {
  const id = value.trim();
  if (
    !id ||
    id.length > 1_000 ||
    /[\s\u0000-\u001f]/.test(id) ||
    /^https?:\/\//i.test(id)
  ) {
    throw new Error("Invalid commerce item identifier");
  }
  return id;
}

function cartQuantity(value: number, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum || value > 100) {
    throw new Error("Invalid cart quantity");
  }
  return value;
}

export function addCartLine(
  state: AuthoritativeCartState,
  variantId: string,
  quantity: number,
): AuthoritativeCartState {
  const id = commerceItemId(variantId);
  const amount = cartQuantity(quantity, 1);
  const lines = state.lineItems.map((line) => ({ ...line }));
  const existing = lines.find((line) => line.variantId === id);
  if (existing) existing.quantity = cartQuantity(existing.quantity + amount);
  else lines.push({ variantId: id, quantity: amount });
  return { ...state, lineItems: lines };
}

export function removeCartLine(
  state: AuthoritativeCartState,
  variantId: string,
): AuthoritativeCartState {
  const id = commerceItemId(variantId);
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
  const id = commerceItemId(variantId);
  const amount = cartQuantity(quantity);
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
