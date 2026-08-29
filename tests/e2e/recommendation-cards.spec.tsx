import { expect, test } from "@playwright/test";
import { productCardView } from "@commerce-agent/presentation/product-card";
import type { CommerceProduct } from "@commerce-agent/providers/types";

test("shows one primary and three alternatives with matching INR prices", async ({
  page,
}) => {
  const products = [
    product("1", "Gift Card", 1500),
    product("2", "Selling Plans Ski Wax", 995),
    product("3", "Gift Card 2", 10000),
    product("4", "Collection Snowboard Liquid", 70095),
  ];
  const cards = products.map(productCardView);
  await page.setContent(`<main>
    <section aria-label="Primary recommendation">
      <article><h3>${cards[0].title}</h3><p>${cards[0].price.display}</p></article>
    </section>
    <p>You can also have a look at these:</p>
    <section aria-label="Alternative recommendations">
      ${cards
        .slice(1)
        .map(
          (card) =>
            `<article><h3>${card.title}</h3><p>${card.price.display}</p></article>`,
        )
        .join("")}
    </section>
  </main>`);

  await expect(page.locator("article")).toHaveCount(4);
  await expect(page.getByText("₹15.00", { exact: true })).toBeVisible();
  await expect(page.getByText("₹9.95", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/You can also have a look at these/),
  ).toBeVisible();
  await expect(page.getByText(/USD/)).toHaveCount(0);
  await expect(page.getByText("₹1,500", { exact: true })).toHaveCount(0);
});

function product(
  id: string,
  title: string,
  amountMinor: number,
): CommerceProduct {
  return {
    provider: "shopify",
    merchant: "test.myshopify.com",
    productId: `gid://shopify/Product/${id}`,
    title,
    description: "",
    handle: null,
    url: null,
    vendor: null,
    productType: null,
    images: [],
    variants: [
      {
        variantId: `gid://shopify/ProductVariant/${id}`,
        title: "Default Title",
        sku: null,
        price: { amountMinor, currency: "INR" },
        available: true,
        options: [],
        image: null,
      },
    ],
    price: { amountMinor, currency: "INR" },
    availability: "available",
    metadata: {},
  };
}
