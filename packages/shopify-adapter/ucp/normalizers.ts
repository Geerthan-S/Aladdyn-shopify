import { CommerceError } from "@commerce-agent/tools/errors";
import type {
  AuthoritativeCartState,
  CartAttribution,
  CommerceCart,
  CommerceCheckout,
  CommerceImage,
  CommerceMoney,
  CommerceProduct,
  CommerceVariant,
} from "@commerce-agent/providers/types";
import { assertCommerceMoney } from "@commerce-agent/money";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function integer(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : fallback;
}

function plainText(value: unknown) {
  const html = string(record(value).html, string(value));
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

function money(value: unknown, fallbackCurrency = "USD"): CommerceMoney {
  const item = record(value);
  const normalized = {
    amountMinor: integer(item.amount),
    currency: string(item.currency, fallbackCurrency).toUpperCase(),
  };
  if (process.env.NODE_ENV !== "production") assertCommerceMoney(normalized);
  return normalized;
}

function image(value: unknown): CommerceImage | null {
  const item = record(value);
  const raw = string(item.url);
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    return { url: url.toString(), altText: string(item.alt_text) || null };
  } catch {
    return null;
  }
}

function normalizeVariant(value: unknown): CommerceVariant | null {
  const item = record(value);
  const id = string(item.id);
  if (!id.startsWith("gid://shopify/ProductVariant/")) return null;
  const variantImage = array(item.media).map(image).find(Boolean) ?? null;
  return {
    variantId: id,
    title: string(item.title, "Default option"),
    sku: string(item.sku) || null,
    price: money(item.price),
    available: record(item.availability).available === true,
    options: array(item.options).map((option) => {
      const entry = record(option);
      return { name: string(entry.name), value: string(entry.label) };
    }),
    image: variantImage,
  };
}

export function normalizeProduct(
  value: unknown,
  merchant: string,
): CommerceProduct | null {
  const item = record(value);
  const productId = string(item.id);
  if (!productId.startsWith("gid://shopify/Product/")) return null;
  const variants = array(item.variants)
    .map(normalizeVariant)
    .filter((variant): variant is CommerceVariant => Boolean(variant));
  const images = array(item.media)
    .map(image)
    .filter((entry): entry is CommerceImage => Boolean(entry));
  const handle = string(item.handle) || null;
  const priceRange = record(item.price_range);
  const price = priceRange.min
    ? money(priceRange.min)
    : (variants[0]?.price ?? { amountMinor: 0, currency: "USD" });
  return {
    provider: "shopify",
    merchant,
    productId,
    title: string(item.title, "Untitled product").slice(0, 500),
    description: plainText(item.description),
    handle,
    url: handle
      ? `https://${merchant}/products/${encodeURIComponent(handle)}`
      : null,
    vendor: string(item.vendor) || null,
    productType: string(item.product_type) || null,
    images,
    variants,
    price,
    availability:
      variants.length === 0
        ? "unknown"
        : variants.some((variant) => variant.available)
          ? "available"
          : "unavailable",
    metadata: { untrustedExternalContent: true },
  };
}

export function normalizeProductList(value: unknown, merchant: string) {
  const payload = record(value);
  return array(payload.products)
    .map((product) => normalizeProduct(product, merchant))
    .filter((product): product is CommerceProduct => Boolean(product));
}

export function validateContinueUrl(value: unknown, merchant: string) {
  const raw = string(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const allowedHost =
      url.hostname === merchant || url.hostname === "checkout.shopify.com";
    if (
      url.protocol !== "https:" ||
      !allowedHost ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function totals(value: unknown, currency: string) {
  return array(value).map((total) => {
    const item = record(total);
    return {
      type: string(item.type, "total"),
      money: money({ amount: item.amount, currency }, currency),
      label: string(item.display_text, string(item.type, "Total")),
    };
  });
}

export function normalizeCart(
  value: unknown,
  merchant: string,
  version: number,
  state: AuthoritativeCartState,
): CommerceCart {
  const outer = record(value);
  const payload = record(outer.cart ?? value);
  const id = string(payload.id);
  if (!id.startsWith("gid://shopify/Cart/")) {
    throw new CommerceError(
      "MCP_ERROR",
      "Shopify returned an invalid cart",
      502,
    );
  }
  const currency = string(payload.currency, state.context.currency ?? "USD");
  const attribution = {
    ...state.attribution,
    ...record(payload.attribution),
  } as CartAttribution;
  return {
    provider: "shopify",
    merchant,
    cartId: id,
    version,
    lines: array(payload.line_items).map((line) => {
      const entry = record(line);
      const product = record(entry.item);
      const rawPrice = product.price;
      return {
        lineId: string(entry.id) || null,
        variantId: string(product.id),
        quantity: integer(entry.quantity),
        title: string(product.title, "Shopify item").slice(0, 500),
        price:
          typeof rawPrice === "number"
            ? { amountMinor: integer(rawPrice), currency }
            : null,
        imageUrl: string(product.image_url) || null,
      };
    }),
    totals: totals(payload.totals, currency),
    currency,
    continueUrl: validateContinueUrl(payload.continue_url, merchant),
    attribution,
  };
}

export function normalizeCheckout(
  value: unknown,
  merchant: string,
  cartId: string,
): CommerceCheckout {
  const outer = record(value);
  const payload = record(outer.checkout ?? value);
  const id = string(payload.id);
  if (!id.startsWith("gid://shopify/Checkout/")) {
    throw new CommerceError(
      "CHECKOUT_UNAVAILABLE",
      "Shopify returned an invalid checkout",
      502,
    );
  }
  const continueUrl = validateContinueUrl(payload.continue_url, merchant);
  if (!continueUrl) {
    throw new CommerceError(
      "UNSAFE_CHECKOUT_URL",
      "Shopify returned an unsafe checkout handoff URL",
      502,
    );
  }
  const allowedStatuses = new Set([
    "incomplete",
    "requires_escalation",
    "ready_for_complete",
    "completed",
    "cancelled",
    "canceled",
  ]);
  const rawStatus = string(payload.status);
  const status =
    rawStatus === "canceled"
      ? "cancelled"
      : allowedStatuses.has(rawStatus)
        ? rawStatus
        : "unknown";
  const currency = string(payload.currency, "USD");
  return {
    provider: "shopify",
    merchant,
    checkoutId: id,
    cartId,
    status: status as CommerceCheckout["status"],
    continueUrl,
    totals: totals(payload.totals, currency),
  };
}
