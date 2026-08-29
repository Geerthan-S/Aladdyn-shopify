# Aladdyn AI Commerce Testing Checklist

Use this checklist only with the Shopify development store. Do not use a live
merchant store or complete a payment.

## One-time setup

- [ ] Apply Supabase migrations 001 through 004.
- [ ] Configure the Supabase, Shopify, and OpenRouter environment variables. Shopify UCP agent credentials are optional for this draft store's public handoff.
- [ ] Confirm `miporis-lite-testing.myshopify.com` has at least one available product.
- [ ] Log in to Aladdyn and click **Connect with Shopify**.
- [ ] Confirm Shopify shows its hosted install/permission screen and returns to the Aladdyn dashboard.
- [ ] Click **Sync products** and confirm the status becomes ready with a non-zero product count.
- [ ] Open **Genie** and confirm no configuration error is shown.

## Scenario 1 — Customer searches for a product

Prompt: `Show me products under ₹2000`

- [ ] OpenRouter returns a useful response.
- [ ] `search_products` runs against Shopify.
- [ ] Every displayed product exists in the test store.
- [ ] Price and availability match Shopify.
- [ ] Product cards contain **View** and an available **Add to cart** option.

Result: Pass / Fail

Notes:

## Scenario 2 — Customer asks for a recommendation

Prompt: `Recommend a product for me under ₹2000`

- [ ] OpenRouter chooses `recommend_products`/catalog search.
- [ ] The response contains only Shopify products.
- [ ] The explanation does not invent preferences, prices, or stock.

Result: Pass / Fail

Notes:

## Scenario 3 — Recommendation uses previous purchase

1. Search for a product.
2. Click **Bought before** on one product card.
3. Prompt: `I bought something similar before. Recommend another option.`

- [ ] The purchase-history confirmation appears.
- [ ] The next request uses the saved customer history.
- [ ] The recommendation relates naturally to the earlier product.
- [ ] The response does not expose internal profile fields or scores.

Result: Pass / Fail

Notes:

## Scenario 4 — Customer adds an item to cart

1. Search for a product.
2. Click an available **Add to cart** option.

- [ ] `get_product` can open the current product details.
- [ ] `add_to_cart` sends a valid Shopify variant ID.
- [ ] Shopify returns a cart containing exactly the selected item and quantity.
- [ ] Cart price and currency match the selected variant.

Result: Pass / Fail

Notes:

## Scenario 5 — Customer starts checkout

1. Use the cart created in Scenario 4.
2. Click **Checkout**.

- [ ] `create_checkout` receives the cart ID and complete line-item state.
- [ ] Genie displays **Continue Secure Checkout**.
- [ ] The link opens an HTTPS Shopify-hosted checkout/cart handoff.
- [ ] Aladdyn does not collect card information or complete payment.

Result: Pass / Fail

Notes:

## Final decision

- Working flows:
- Failed flows:
- Blocking configuration:
- Safe modules to extract into Aladdyn:
