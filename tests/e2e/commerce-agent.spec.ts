import { expect, test } from "@playwright/test";

const email = process.env.E2E_MERCHANT_EMAIL;
const password = process.env.E2E_MERCHANT_PASSWORD;
const query = process.env.E2E_PRODUCT_QUERY;

test("installed merchant syncs, receives a recommendation, and creates a cart", async ({
  page,
}) => {
  test.skip(
    !email || !password || !query,
    "Set live merchant test credentials and a product query to run this journey.",
  );

  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/(connect|dashboard)$/);

  if (page.url().endsWith("/connect")) {
    test.fail(
      true,
      "Complete Shopify-hosted installation for this merchant first.",
    );
  }

  await page.getByRole("button", { name: /Sync products|Sync again/ }).click();
  await expect(page.getByText(/Products synced|Sync complete/i)).toBeVisible({
    timeout: 120_000,
  });

  await page.getByRole("link", { name: "Genie" }).click();
  await page.getByLabel("Message Genie").fill(`Recommend ${query}`);
  await page.getByRole("button", { name: /send/i }).click();
  await expect(
    page.getByText(/personalized option|found .* product/i),
  ).toBeVisible({
    timeout: 60_000,
  });

  await page.getByRole("button", { name: "Bought before" }).first().click();
  await expect(page.getByText(/use .* as purchase history/i)).toBeVisible();
  await page
    .getByLabel("Message Genie")
    .fill("Recommend another option based on my previous purchase");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(
    page.getByText(/personalized option|found .* product/i).last(),
  ).toBeVisible({ timeout: 60_000 });

  const addButton = page.getByRole("button", { name: /add .*cart/i }).first();
  await expect(addButton).toBeVisible();
  await addButton.click();
  await expect(page.getByText(/Added to your cart/i)).toBeVisible();
});
