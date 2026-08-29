import type { ProductProvider } from "@commerce-agent/providers/product-provider";
import type {
  AuthoritativeCartState,
  CommerceCart,
  CommerceCheckout,
  ProviderCapabilities,
} from "@commerce-agent/providers/types";

export interface CommerceConnector extends ProductProvider {
  capabilities(): ProviderCapabilities;
  createCart(
    state: AuthoritativeCartState,
    version: number,
    idempotencyKey: string,
  ): Promise<CommerceCart>;
  getCart(
    cartId: string,
    state: AuthoritativeCartState,
    version: number,
  ): Promise<CommerceCart>;
  updateCart(
    cartId: string,
    state: AuthoritativeCartState,
    version: number,
    idempotencyKey: string,
  ): Promise<CommerceCart>;
  createCheckout(
    cartId: string,
    state: AuthoritativeCartState,
    idempotencyKey: string,
  ): Promise<CommerceCheckout>;
  getCheckout(checkoutId: string, cartId: string): Promise<CommerceCheckout>;
}

export type CommerceConnectorFactory = (
  merchant: string,
) => Promise<CommerceConnector>;
