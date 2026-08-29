import { majorUnits } from "@commerce-agent/money";
import type { ProductSearchInput } from "@commerce-agent/providers/product-provider";
import type {
  CommerceProduct,
  ProductRecommendation,
} from "@commerce-agent/providers/types";

export type ProductDiscovery = {
  candidateProducts: CommerceProduct[];
  matchingProducts: CommerceProduct[];
  visibleProducts: CommerceProduct[];
  recommendation: ProductRecommendation;
};

export function buildProductDiscovery(
  candidates: CommerceProduct[],
  constraints: ProductSearchInput,
): ProductDiscovery {
  const matching = candidates.filter((product) =>
    satisfiesHardConstraints(product, constraints),
  );
  const ranked = rankProducts(matching, constraints);
  const displayMode = constraints.displayMode ?? "recommended";
  const visibleProducts =
    displayMode === "expanded" ? ranked : ranked.slice(0, 4);
  const [primary = null, ...alternatives] = visibleProducts;
  return {
    candidateProducts: candidates,
    matchingProducts: ranked,
    visibleProducts,
    recommendation: {
      primary,
      alternatives,
      totalMatches: ranked.length,
      displayMode,
    },
  };
}

function satisfiesHardConstraints(
  product: CommerceProduct,
  constraints: ProductSearchInput,
) {
  if (product.availability !== "available") return false;
  if (constraints.currency && product.price.currency !== constraints.currency) {
    return false;
  }
  if (
    constraints.requiredTerms?.length &&
    !matchesRequiredTerms(product, constraints.requiredTerms)
  ) {
    return false;
  }
  if (constraints.strict === false) return true;
  const price = majorUnits(product.price);
  if (constraints.minPrice !== undefined && price < constraints.minPrice) {
    return false;
  }
  if (constraints.maxPrice !== undefined) {
    if (constraints.maxExclusive && price >= constraints.maxPrice) return false;
    if (!constraints.maxExclusive && price > constraints.maxPrice) return false;
  }
  return true;
}

function matchesRequiredTerms(product: CommerceProduct, terms: string[]) {
  const source = [
    product.title,
    product.description,
    product.productType,
    product.vendor,
    ...product.variants.flatMap((variant) => [
      variant.title,
      ...variant.options.flatMap((option) => [option.name, option.value]),
    ]),
  ]
    .filter(Boolean)
    .join(" ");
  const haystack = normalizeTerms(source);
  const compact = source.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return terms.every((term) => {
    const normalized = singularize(term.toLowerCase());
    return haystack.has(normalized) || compact.includes(normalized);
  });
}

function normalizeTerms(value: string) {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map(singularize),
  );
}

function singularize(value: string) {
  return value.length > 3 && value.endsWith("s") ? value.slice(0, -1) : value;
}

function rankProducts(
  products: CommerceProduct[],
  constraints: ProductSearchInput,
) {
  if (constraints.targetPrice === undefined) return [...products];
  return products
    .map((product, index) => ({
      product,
      index,
      distance: Math.abs(majorUnits(product.price) - constraints.targetPrice!),
    }))
    .sort(
      (left, right) =>
        left.distance - right.distance || left.index - right.index,
    )
    .map((entry) => entry.product);
}
